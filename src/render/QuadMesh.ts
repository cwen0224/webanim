import { Graphics, Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { Quad, Point, SceneObject } from '../core/model/types'
import { uvToWorld, distanceSq } from '../core/transform/quad'

const HANDLE_RADIUS  = 8
const HANDLE_HIT     = 24
const PIVOT_RADIUS   = 7
const PIN_SIZE       = 7
const ROT_HANDLE_R   = 6
const ROT_OFFSET     = 34   // 距頂邊多遠
const SCALE_HANDLE_R = 7
const SCALE_HIT      = 24

export type DragTarget =
  | { kind: 'corner'; index: number }
  | { kind: 'pivot' }
  | { kind: 'rotate' }
  | { kind: 'scale'; pivotWorld: Point; startDist: number }
  | { kind: 'body' }

export class QuadMesh {
  readonly container: Container
  private body:    Graphics
  public overlay: Graphics
  public joints:  Graphics
  private _mesh:   Mesh | null = null
  private _texture: Texture | null = null
  private _loadingUrl: string | null = null
  private _meshPivotUV = { u: -1, v: -1 }   // 上次建立 mesh 時的重心 UV
  private _lastSelected    = false
  private _lastShowJoints  = true
  private _selectedCorners: number[] = []
  private _obj: SceneObject

  constructor(obj: SceneObject) {
    this._obj      = obj
    this.container = new Container()
    this.body      = new Graphics()
    this.overlay   = new Graphics()
    this.joints    = new Graphics()
    this.container.addChild(this.body)
    // overlay 和 joints 將由 StageManager 統一加到最上層容器
    this._redrawBody()
    if (obj.textureUrl) {
      this._loadingUrl = obj.textureUrl
      this._loadTexture(obj.textureUrl)
    }
  }

  get quad() { return this._obj.quad }

  // 只把視覺層（body / mesh）render 到 target，handles/joints 暫時隱藏
  renderVisual(renderer: { render: (opts: { container: unknown; target: unknown; clear: boolean }) => void }, target: unknown, clear: boolean, blendMode: string) {
    const savedBM = (this.container as any).blendMode
    const savedOv = this.overlay.visible
    const savedJo = this.joints.visible
    ;(this.container as any).blendMode = blendMode
    this.overlay.visible = false
    this.joints.visible  = false
    renderer.render({ container: this.container, target, clear })
    ;(this.container as any).blendMode = savedBM
    this.overlay.visible = savedOv
    this.joints.visible  = savedJo
  }

  update(obj: SceneObject, selected: boolean, showJoints: boolean, selectedCorners: number[] = []) {
    this._obj             = obj
    this._lastSelected    = selected
    this._lastShowJoints  = showJoints
    this._selectedCorners = selectedCorners

    const wantUrl = obj.textureUrl ?? null
    if (wantUrl !== this._loadingUrl) {
      this._loadingUrl = wantUrl
      this._texture    = null
      this._destroyMesh()
      if (wantUrl) this._loadTexture(wantUrl)
    }

    if (this._texture) {
      this._updateMesh()
      this.body.clear()
    } else {
      this._redrawBody()
    }
    this._redrawOverlay(selected, selectedCorners)
    this._redrawJoints(showJoints)
  }

  private async _loadTexture(url: string) {
    try {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload  = () => res()
        img.onerror = () => rej(new Error(`Failed to load image: ${url}`))
        img.src     = url
      })
      if (this._loadingUrl !== url) return   // URL 已被換掉，忽略
      this._texture = Texture.from(img)
      this._updateMesh()
      this.body.clear()
      this._redrawOverlay(this._lastSelected, this._selectedCorners)
      this._redrawJoints(this._lastShowJoints)
    } catch (e) {
      console.error('Texture load failed:', url, e)
    }
  }

  private _updateMesh() {
    if (!this._texture) return
    const q   = this._obj.quad
    const puv = this._obj.pivot.uv
    const c   = uvToWorld(puv, q)   // 重心世界座標

    // 重心 UV 沒變 → 只原地更新頂點位置，不重建 GPU 物件
    if (this._mesh && puv.u === this._meshPivotUV.u && puv.v === this._meshPivotUV.v) {
      const pos = (this._mesh.geometry as MeshGeometry).positions
      pos[0] = q[0].x; pos[1] = q[0].y
      pos[2] = q[1].x; pos[3] = q[1].y
      pos[4] = q[2].x; pos[5] = q[2].y
      pos[6] = q[3].x; pos[7] = q[3].y
      pos[8] = c.x;    pos[9] = c.y
      this._mesh.geometry.getAttribute('aPosition').buffer.update()
      this._mesh.alpha = this._obj.opacity
      return
    }

    // 重建：重心 UV 改變，或首次建立
    this._destroyMesh()
    this._meshPivotUV = { u: puv.u, v: puv.v }

    // 5 頂點（TL TR BR BL 重心）× 4 三角形，以重心為中心的扇形切割
    const geometry = new MeshGeometry({
      positions: new Float32Array([
        q[0].x, q[0].y,   // 0 TL
        q[1].x, q[1].y,   // 1 TR
        q[2].x, q[2].y,   // 2 BR
        q[3].x, q[3].y,   // 3 BL
        c.x,    c.y,      // 4 重心
      ]),
      uvs: new Float32Array([
        0,     0,          // 0 TL
        1,     0,          // 1 TR
        1,     1,          // 2 BR
        0,     1,          // 3 BL
        puv.u, puv.v,      // 4 重心
      ]),
      indices: new Uint32Array([
        0, 1, 4,   // TL–TR–重心
        1, 2, 4,   // TR–BR–重心
        2, 3, 4,   // BR–BL–重心
        3, 0, 4,   // BL–TL–重心
      ]),
    })
    this._mesh        = new Mesh({ geometry, texture: this._texture })
    this._mesh.alpha  = this._obj.opacity
    this.container.addChildAt(this._mesh, 0)
  }

  private _destroyMesh() {
    if (this._mesh) {
      this.container.removeChild(this._mesh)
      this._mesh.destroy()
      this._mesh = null
    }
  }

  hitTest(pt: Point, selected: boolean, editPivotMode = false): DragTarget | null {
    const q = this._obj.quad
    if (selected) {
      if (editPivotMode) {
        // 重心編輯模式：只偵測重心（不搶角落）
        const pv = uvToWorld(this._obj.pivot.uv, q)
        if (distanceSq(pt, pv) <= HANDLE_HIT ** 2) return { kind: 'pivot' }
        if (this._pointInQuad(pt))                 return { kind: 'body' }
        return null
      }

      // 轉動把手（優先偵測）
      const rh = this._rotHandlePos(q)
      if (distanceSq(pt, rh) <= 24 ** 2)
        return { kind: 'rotate' }

      // 縮放把手
      const sh = this._scaleHandlePos(q)
      if (distanceSq(pt, sh) <= SCALE_HIT ** 2) {
        const pivotWorld = uvToWorld(this._obj.pivot.uv, q)
        const dx = sh.x - pivotWorld.x, dy = sh.y - pivotWorld.y
        return { kind: 'scale', pivotWorld, startDist: Math.sqrt(dx * dx + dy * dy) }
      }

      // 角落
      for (let i = 0; i < 4; i++) {
        if (distanceSq(pt, q[i]) <= HANDLE_HIT ** 2)
          return { kind: 'corner', index: i }
    }
    if (this._pointInQuad(pt)) return { kind: 'body' }
    return null
  }

  rotHandlePos():   Point { return this._rotHandlePos(this._obj.quad) }
  scaleHandlePos(): Point { return this._scaleHandlePos(this._obj.quad) }

  uvToWorld(uv: { u: number; v: number }): Point {
    return uvToWorld(uv, this._obj.quad)
  }

  // ── 私有繪製 ──────────────────────────────────────────────────────

  private _redrawBody() {
    const q = this._obj.quad
    this.body.clear()

    if (this._obj.isDeformer) {
      // 虛線框，無填色
      for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) continue
        const nx = dx / len, ny = dy / len
        let t = 0, on = true
        while (t < len) {
          const step = on ? 9 : 5
          const t2   = Math.min(t + step, len)
          if (on) this.body.moveTo(a.x + nx * t, a.y + ny * t).lineTo(a.x + nx * t2, a.y + ny * t2)
          t = t2; on = !on
        }
      }
      this.body.stroke({ color: 0x44aaff, width: 1.5, alpha: 0.7 })
      return
    }

    this.body
      .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
      .fill({ color: this._obj.tint, alpha: this._obj.opacity })
  }

  private _redrawOverlay(selected: boolean, selectedCorners: number[] = []) {
    const q = this._obj.quad
    this.overlay.clear()
    if (!selected && selectedCorners.length === 0) return

    const isD      = this._obj.isDeformer
    const rimColor = isD ? 0x44aaff : 0xffffff

    if (selected) {
      // 外框線（保留在 PixiJS，只是線條）
      this.overlay
        .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
        .stroke({ color: rimColor, width: 1.5, alpha: 0.8 })

      // 轉動把手連接線與隱形觸控區
      const rh     = this._rotHandlePos(q)
      const topMid = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 }
      this.overlay
        .moveTo(topMid.x, topMid.y).lineTo(rh.x, rh.y)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.5 })
      this.overlay.circle(rh.x, rh.y, HANDLE_HIT).fill({ color: 0xffffff, alpha: 0.001 })

      // 縮放把手連接線與隱形觸控區
      const sh = this._scaleHandlePos(q)
      this.overlay
        .moveTo(q[1].x, q[1].y).lineTo(sh.x, sh.y)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.4 })
      this.overlay.circle(sh.x, sh.y, HANDLE_HIT).fill({ color: 0xffffff, alpha: 0.001 })
    }
    // 角落控制點隱形觸控區
    for (let i = 0; i < 4; i++) {
      if (selected || selectedCorners.includes(i)) {
        this.overlay.circle(q[i].x, q[i].y, HANDLE_HIT).fill({ color: 0xffffff, alpha: 0.001 })
      }
    }
  }

  private _redrawJoints(show: boolean) {
    this.joints.clear()
    if (!show) return
    const q = this._obj.quad

    // 雖然視覺移到 SVG 了，但必須在 PixiJS 畫隱形圓形讓 container 接觸得到滑鼠
    const pv = uvToWorld(this._obj.pivot.uv, q)
    this.joints.circle(pv.x, pv.y, HANDLE_HIT).fill({ color: 0xffffff, alpha: 0.001 })

    for (const pin of this._obj.pins) {
      const pw = uvToWorld(pin.uv, q)
      this.joints.circle(pw.x, pw.y, HANDLE_HIT).fill({ color: 0xffffff, alpha: 0.001 })
    }
  }

  // ── 公開：回傳 SVG gizmo 所需的所有位置資料 ──────────────────────
  getGizmoData(selected: boolean, showJoints: boolean, selectedCorners: number[]) {
    const q    = this._obj.quad
    const isD  = this._obj.isDeformer

    const corners: { x: number; y: number; highlight: boolean }[] = []
    if (selected) {
      for (let i = 0; i < 4; i++)
        corners.push({ x: q[i].x, y: q[i].y, highlight: selectedCorners.includes(i) })
    } else {
      for (const ci of selectedCorners)
        corners.push({ x: q[ci].x, y: q[ci].y, highlight: true })
    }

    const pivot   = showJoints ? uvToWorld(this._obj.pivot.uv, q) : null
    const pins    = showJoints ? this._obj.pins.map(p => ({
      pos:   uvToWorld(p.uv, q),
      bound: !!p.boundToObjectId,
    })) : []
    const rotH    = selected ? this._rotHandlePos(q) : null
    const scaleH  = selected ? this._scaleHandlePos(q) : null

    return { corners, pivot, pins, rotH, scaleH, isDeformer: isD }
  }

  // 轉動把手的世界座標（頂邊中點往外 ROT_OFFSET px）
  private _rotHandlePos(q: Quad): Point {
    const tl = q[0], tr = q[1]
    const mx  = (tl.x + tr.x) / 2
    const my  = (tl.y + tr.y) / 2
    const ex  = tr.x - tl.x
    const ey  = tr.y - tl.y
    const len = Math.sqrt(ex * ex + ey * ey) || 1
    // 垂直於頂邊、指向外側（螢幕往上）
    return {
      x: mx + (ey / len) * ROT_OFFSET,
      y: my - (ex / len) * ROT_OFFSET,
    }
  }

  // 縮放把手：右上角頂點往右上方向偏移
  private _scaleHandlePos(q: Quad): Point {
    const tr = q[1]
    const dx = tr.x - q[0].x, dy = tr.y - q[0].y   // 頂邊方向
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / len, ny = dy / len
    const ox =  ny, oy = -nx               // 頂邊法線（朝上）
    return { x: tr.x + nx * 20 + ox * 20, y: tr.y + ny * 20 + oy * 20 }
  }

  private _pointInQuad(pt: Point): boolean {
    const q = this._obj.quad
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4]
      if ((b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) < 0) return false
    }
    return true
  }
}
