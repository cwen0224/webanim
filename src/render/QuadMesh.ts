import { Graphics, Container, Mesh, MeshGeometry, Assets, Texture } from 'pixi.js'
import type { Quad, Point, SceneObject } from '../core/model/types'
import { uvToWorld, distanceSq } from '../core/transform/quad'

const HANDLE_RADIUS  = 8
const HANDLE_HIT     = 14
const PIVOT_RADIUS   = 7
const PIN_SIZE       = 7
const ROT_HANDLE_R   = 6
const ROT_OFFSET     = 34   // 距頂邊多遠

export type DragTarget =
  | { kind: 'corner'; index: number }
  | { kind: 'pivot' }
  | { kind: 'rotate' }
  | { kind: 'body' }

export class QuadMesh {
  readonly container: Container
  private body:    Graphics
  private overlay: Graphics
  private joints:  Graphics
  private _mesh:   Mesh | null = null
  private _texture: Texture | null = null
  private _loadingUrl: string | null = null
  private _lastSelected  = false
  private _lastShowJoints = true
  private _obj: SceneObject

  constructor(obj: SceneObject) {
    this._obj      = obj
    this.container = new Container()
    this.body      = new Graphics()
    this.overlay   = new Graphics()
    this.joints    = new Graphics()
    this.container.addChild(this.body)
    this.container.addChild(this.overlay)
    this.container.addChild(this.joints)
    this._redrawBody()
    if (obj.textureUrl) {
      this._loadingUrl = obj.textureUrl
      this._loadTexture(obj.textureUrl)
    }
  }

  get quad() { return this._obj.quad }

  update(obj: SceneObject, selected: boolean, showJoints: boolean) {
    this._obj            = obj
    this._lastSelected   = selected
    this._lastShowJoints = showJoints

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
    this._redrawOverlay(selected)
    this._redrawJoints(showJoints)
  }

  private async _loadTexture(url: string) {
    try {
      const texture = await Assets.load<Texture>(url)
      if (this._loadingUrl !== url) return   // URL 已被換掉，忽略
      this._texture = texture
      this._updateMesh()
      this.body.clear()
      this._redrawOverlay(this._lastSelected)
      this._redrawJoints(this._lastShowJoints)
    } catch (e) {
      console.error('Texture load failed:', url, e)
    }
  }

  private _updateMesh() {
    if (!this._texture) return
    const q   = this._obj.quad
    const pos = (this._mesh?.geometry as MeshGeometry | undefined)?.positions

    if (this._mesh && pos) {
      // 原地更新頂點位置，不重建 GPU 物件
      pos[0] = q[0].x; pos[1] = q[0].y
      pos[2] = q[1].x; pos[3] = q[1].y
      pos[4] = q[2].x; pos[5] = q[2].y
      pos[6] = q[3].x; pos[7] = q[3].y
      this._mesh.geometry.getAttribute('aPosition').buffer.update()
      this._mesh.tint  = this._obj.tint
      this._mesh.alpha = this._obj.opacity
      return
    }

    this._destroyMesh()
    const geometry = new MeshGeometry({
      positions: new Float32Array([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]),
      uvs:       new Float32Array([0, 0,   1, 0,   1, 1,   0, 1]),
      indices:   new Uint32Array([0, 1, 2,  0, 2, 3]),
    })
    this._mesh        = new Mesh({ geometry, texture: this._texture })
    this._mesh.tint   = this._obj.tint
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

  hitTest(pt: Point, selected: boolean): DragTarget | null {
    const q = this._obj.quad
    if (selected) {
      // 轉動把手（優先偵測，否則容易誤觸角落）
      const rh = this._rotHandlePos(q)
      if (distanceSq(pt, rh) <= (ROT_HANDLE_R + 6) ** 2)
        return { kind: 'rotate' }

      // 角落
      for (let i = 0; i < 4; i++) {
        if (distanceSq(pt, q[i]) <= HANDLE_HIT ** 2)
          return { kind: 'corner', index: i }
      }
      // 重心
      const pv = uvToWorld(this._obj.pivot.uv, q)
      if (distanceSq(pt, pv) <= HANDLE_HIT ** 2)
        return { kind: 'pivot' }
    }
    if (this._pointInQuad(pt)) return { kind: 'body' }
    return null
  }

  rotHandlePos(): Point { return this._rotHandlePos(this._obj.quad) }

  uvToWorld(uv: { u: number; v: number }): Point {
    return uvToWorld(uv, this._obj.quad)
  }

  // ── 私有繪製 ──────────────────────────────────────────────────────

  private _redrawBody() {
    const q = this._obj.quad
    this.body.clear()
    this.body
      .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
      .fill({ color: this._obj.tint, alpha: this._obj.opacity })
  }

  private _redrawOverlay(selected: boolean) {
    const q = this._obj.quad
    this.overlay.clear()
    if (!selected) return

    // 外框
    this.overlay
      .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 })

    // 角落控制點
    for (const p of q) {
      this.overlay
        .circle(p.x, p.y, HANDLE_RADIUS)
        .fill({ color: 0xffffff })
        .circle(p.x, p.y, HANDLE_RADIUS)
        .stroke({ color: 0x4a9eff, width: 2 })
    }

    // 轉動把手：虛線連到頂邊中點 + 圓圈
    const rh     = this._rotHandlePos(q)
    const topMid = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 }
    this.overlay
      .moveTo(topMid.x, topMid.y)
      .lineTo(rh.x, rh.y)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.5 })
    this.overlay
      .circle(rh.x, rh.y, ROT_HANDLE_R)
      .fill({ color: 0x22cc88 })
      .circle(rh.x, rh.y, ROT_HANDLE_R)
      .stroke({ color: 0xffffff, width: 1.5 })
    // 箭頭弧（用小點代替）
    this.overlay
      .circle(rh.x, rh.y, ROT_HANDLE_R - 2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.4 })
  }

  private _redrawJoints(show: boolean) {
    this.joints.clear()
    if (!show) return
    const q = this._obj.quad

    // 重心（橘色十字圓）
    const pv = uvToWorld(this._obj.pivot.uv, q)
    this.joints
      .circle(pv.x, pv.y, PIVOT_RADIUS)
      .stroke({ color: 0xff8800, width: 2, alpha: 0.9 })
    this.joints
      .moveTo(pv.x - PIVOT_RADIUS - 3, pv.y).lineTo(pv.x + PIVOT_RADIUS + 3, pv.y)
      .stroke({ color: 0xff8800, width: 1.5, alpha: 0.9 })
    this.joints
      .moveTo(pv.x, pv.y - PIVOT_RADIUS - 3).lineTo(pv.x, pv.y + PIVOT_RADIUS + 3)
      .stroke({ color: 0xff8800, width: 1.5, alpha: 0.9 })

    // 插銷（藍/青菱形）
    for (const pin of this._obj.pins) {
      const pw = uvToWorld(pin.uv, q)
      const s  = PIN_SIZE
      this.joints
        .poly([pw.x, pw.y - s, pw.x + s, pw.y, pw.x, pw.y + s, pw.x - s, pw.y])
        .fill({ color: pin.boundToObjectId ? 0x00ffcc : 0x4a9eff, alpha: 0.9 })
        .poly([pw.x, pw.y - s, pw.x + s, pw.y, pw.x, pw.y + s, pw.x - s, pw.y])
        .stroke({ color: 0xffffff, width: 1 })
    }
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

  private _pointInQuad(pt: Point): boolean {
    const q = this._obj.quad
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4]
      if ((b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) < 0) return false
    }
    return true
  }
}
