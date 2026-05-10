import { Application, Graphics, AlphaMask, RenderTexture, Sprite } from 'pixi.js'
import type { Point, Quad, SceneObject } from '../core/model/types'
import { QuadMesh } from './QuadMesh'
import { moveQuad, worldToUV, uvToWorld } from '../core/transform/quad'
import type { EditorMode, VertexRef } from '../store/sceneStore'

interface StoreActions {
  select:              (id: string | null) => void
  selectVertices:      (verts: VertexRef[]) => void
  setBaseQuad:         (id: string, quad: Quad) => void
  setBaseQuads:        (updates: Record<string, Quad>) => void
  autoRecordKeyframe:  (id: string) => void
  setPivotUV:          (id: string, uv: { u: number; v: number }) => void
  addPin:              (id: string, uv: { u: number; v: number }) => string
  bindPin:             (objectId: string, pinId: string, targetObjectId: string) => void
  bindToDeformer:      (objectId: string, deformerId: string) => void
  addMask:             (objectId: string, maskObjectId: string) => void
  setMode:             (mode: EditorMode) => void
  pushHistory:         () => void
}

type DragKind =
  | { kind: 'corner'; index: number }
  | { kind: 'pivot' }
  | { kind: 'rotate';    pivotWorld: Point; startAngle: number }
  | { kind: 'scale';     pivotWorld: Point; startDist: number }
  | { kind: 'selRotate'; centroid: Point;   startAngle: number }
  | { kind: 'body' }

interface DragState {
  meshId:          string
  target:          DragKind
  startPt:         Point
  startQuad:       Quad
  multiStartQuads?: Record<string, Quad>  // for multi-vertex drag
}

export class StageManager {
  readonly app: Application
  private meshes = new Map<string, QuadMesh>()
  // key = "objId|maskObjId"
  // 每幀把遮罩物件的視覺內容 render 到 RenderTexture，以 alpha 通道作為遮罩（正/反由 AlphaMask.inverse 控制）
  private maskGfxMap = new Map<string, {
    rt:     RenderTexture
    sprite: Sprite
    am:     AlphaMask
    mode:   string
  }>()
  private bg: Graphics
  private drag: DragState | null = null
  private store: StoreActions
  private _pendingBind:         { objectId: string; pinId: string } | null = null
  private _pendingDeformerBind: string | null = null
  private _pendingMaskPick:     string | null = null   // objectId 等待選遮罩來源
  private _mode: EditorMode = 'select'
  private _selectedVertices: VertexRef[] = []
  private _lassoStart:  Point | null = null
  private _lassoGfx:    Graphics
  private _selGfx:      Graphics   // 套索選取後的 gizmo overlay
  private _lastPt:      Point = { x: 0, y: 0 }   // 最後游標位置，供旋轉把手跟隨用

  constructor(app: Application, store: StoreActions) {
    this.app   = app
    this.store = store

    this.bg = new Graphics()
    this.bg.rect(0, 0, 4096, 4096).fill({ color: 0x2a2a2a })
    this.bg.eventMode = 'static'
    this.bg.on('pointerdown', (e) => this._onBgDown(e as { global: Point; shiftKey: boolean }))
    app.stage.addChild(this.bg)

    this._lassoGfx = new Graphics()
    this._selGfx   = new Graphics()
    this._selGfx.eventMode = 'static'
    // 動態 hitArea：只有旋轉把手附近 14px 才可點擊
    ;(this._selGfx as any).hitArea = {
      contains: (x: number, y: number) => {
        const rh = (this._selGfx as any)._rotHandle as Point | undefined
        if (!rh) return false
        const dx = x - rh.x, dy = y - rh.y
        return dx * dx + dy * dy <= 14 * 14
      }
    }
    this._selGfx.on('pointerdown', (e: any) => {
      e.stopPropagation()
      this._onSelGizmoDown(e as { global: Point })
    })
    app.stage.addChild(this._lassoGfx)
    app.stage.addChild(this._selGfx)

    app.stage.eventMode = 'static'
    app.stage.on('pointermove', this._onMove.bind(this))
    app.stage.on('pointerup',   this._onUp.bind(this))
  }

  sync(
    objects: Record<string, SceneObject>,
    selectedId: string | null,
    mode: EditorMode,
    showJoints: boolean,
    selectedVertices: VertexRef[] = [],
  ) {
    this._mode             = mode
    this._selectedVertices = selectedVertices

    for (const [id, qm] of this.meshes) {
      if (!objects[id]) { this.app.stage.removeChild(qm.container); this.meshes.delete(id) }
    }

    const sorted = Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
    for (const obj of sorted) {
      let qm = this.meshes.get(obj.id)
      if (!qm) {
        qm = new QuadMesh(obj)
        qm.container.eventMode = 'static'
        qm.container.on('pointerdown', (e: { global: Point; shiftKey: boolean; stopPropagation: () => void }) => {
          if (e.shiftKey) {
            this._lassoStart = { ...e.global }
            return
          }
          e.stopPropagation()
          this._onObjectDown(e.global, obj.id, this._mode)
        })
        this.meshes.set(obj.id, qm)
        this.app.stage.addChild(qm.container)
      }
      const selCorners = selectedVertices.filter(v => v.objId === obj.id).map(v => v.cornerIndex)
      qm.update(obj, obj.id === selectedId, showJoints, selCorners)
    }
    // 依 zIndex 重新排序 PixiJS 子節點（bg 永遠在最底），overlay 最頂
    for (const obj of sorted) {
      const qm = this.meshes.get(obj.id)
      if (qm) this.app.stage.addChild(qm.container)
    }
    this.app.stage.addChild(this._lassoGfx)
    this.app.stage.addChild(this._selGfx)
    const cursorOverride = this.drag?.target.kind === 'selRotate' ? this._lastPt : undefined
    this._drawSelGizmo(selectedVertices, cursorOverride)

    // ── 遮罩 ─────────────────────────────────────────────────────────
    this._syncMasks(objects)
  }

  setPendingBind(objectId: string, pinId: string) { this._pendingBind = { objectId, pinId } }
  clearPendingBind()                               { this._pendingBind = null }

  setPendingDeformerBind(objectId: string) { this._pendingDeformerBind = objectId }
  clearPendingDeformerBind()               { this._pendingDeformerBind = null }

  setPendingMaskPick(objectId: string) { this._pendingMaskPick = objectId }
  clearPendingMaskPick()               { this._pendingMaskPick = null }

  private _onBgDown(e: { global: Point; shiftKey: boolean }) {
    const pt = e.global
    if (this._pendingBind)         { this._pendingBind = null;         this.store.setMode('select'); return }
    if (this._pendingDeformerBind) { this._pendingDeformerBind = null; this.store.setMode('select'); return }
    if (this._pendingMaskPick)     { this._pendingMaskPick = null;     this.store.setMode('select'); return }
    if (e.shiftKey) {
      this._lassoStart = { ...pt }
      return
    }
    this.store.select(null)
    this.store.selectVertices([])
  }

  private _onObjectDown(pt: Point, id: string, mode: EditorMode) {
    if (mode === 'bind' && this._pendingBind && this._pendingBind.objectId !== id) {
      this.store.bindPin(this._pendingBind.objectId, this._pendingBind.pinId, id)
      this._pendingBind = null
      this.store.setMode('select')
      return
    }

    if (mode === 'bindDeformer' && this._pendingDeformerBind && this._pendingDeformerBind !== id) {
      this.store.bindToDeformer(this._pendingDeformerBind, id)
      this._pendingDeformerBind = null
      this.store.setMode('select')
      return
    }

    if (mode === 'pickMask' && this._pendingMaskPick && this._pendingMaskPick !== id) {
      this.store.addMask(this._pendingMaskPick, id)
      this._pendingMaskPick = null
      this.store.setMode('select')
      return
    }

    if (mode === 'addPin') {
      const qm = this.meshes.get(id)
      if (qm) this.store.addPin(id, worldToUV(pt, qm.quad))
      this.store.setMode('select')
      this.store.select(id)
      return
    }

    this.store.select(id)
    const qm = this.meshes.get(id)
    if (!qm) return
    const hit = qm.hitTest(pt, true, mode === 'editPivot')
    if (!hit) return

    this.store.pushHistory()

    if (hit.kind === 'rotate') {
      const pivotWorld = uvToWorld((qm as any)._obj.pivot.uv, qm.quad)
      this.drag = {
        meshId: id, startPt: { ...pt }, startQuad: [...qm.quad] as Quad,
        target: { kind: 'rotate', pivotWorld, startAngle: Math.atan2(pt.y - pivotWorld.y, pt.x - pivotWorld.x) },
      }
    } else if (hit.kind === 'scale') {
      this.drag = { meshId: id, target: hit, startPt: { ...pt }, startQuad: [...qm.quad] as Quad }
    } else if (
      hit.kind === 'corner' &&
      this._selectedVertices.length > 1 &&
      this._selectedVertices.some(v => v.objId === id && v.cornerIndex === hit.index)
    ) {
      // 多頂點拖曳：收集所有受影響物件的起始 quad
      const multiStartQuads: Record<string, Quad> = {}
      for (const v of this._selectedVertices) {
        if (!multiStartQuads[v.objId]) {
          const m = this.meshes.get(v.objId)
          if (m) multiStartQuads[v.objId] = [...m.quad] as Quad
        }
      }
      this.drag = { meshId: id, target: hit, startPt: { ...pt }, startQuad: [...qm.quad] as Quad, multiStartQuads }
    } else {
      this.drag = { meshId: id, target: hit, startPt: { ...pt }, startQuad: [...qm.quad] as Quad }
    }
  }

  private _onMove(e: { global: { x: number; y: number } }) {
    const pt = e.global as Point
    this._lastPt = pt

    // 套索矩形繪製
    if (this._lassoStart) {
      const x = Math.min(pt.x, this._lassoStart.x)
      const y = Math.min(pt.y, this._lassoStart.y)
      const w = Math.abs(pt.x - this._lassoStart.x)
      const h = Math.abs(pt.y - this._lassoStart.y)
      this._lassoGfx.clear()
        .rect(x, y, w, h).fill({ color: 0x4a9eff, alpha: 0.12 })
        .rect(x, y, w, h).stroke({ color: 0x4a9eff, width: 1.5, alpha: 0.85 })
      return
    }

    if (!this.drag) return
    const dx = pt.x - this.drag.startPt.x
    const dy = pt.y - this.drag.startPt.y
    const q  = [...this.drag.startQuad] as Quad

    if (this.drag.target.kind === 'body') {
      this.store.setBaseQuad(this.drag.meshId, moveQuad(q, dx, dy))

    } else if (this.drag.target.kind === 'corner') {
      if (this.drag.multiStartQuads) {
        // 多頂點同步移動
        const updates: Record<string, Quad> = {}
        for (const v of this._selectedVertices) {
          const sq = this.drag.multiStartQuads[v.objId]
          if (!sq) continue
          if (!updates[v.objId]) updates[v.objId] = [...sq] as Quad
          updates[v.objId][v.cornerIndex] = { x: sq[v.cornerIndex].x + dx, y: sq[v.cornerIndex].y + dy }
        }
        this.store.setBaseQuads(updates)
      } else {
        const i = this.drag.target.index
        const newQ = [...q] as Quad
        newQ[i] = { x: q[i].x + dx, y: q[i].y + dy }
        this.store.setBaseQuad(this.drag.meshId, newQ)
      }

    } else if (this.drag.target.kind === 'rotate') {
      const { pivotWorld, startAngle } = this.drag.target
      const curAngle = Math.atan2(pt.y - pivotWorld.y, pt.x - pivotWorld.x)
      // 取最短旋轉路徑（正規化到 -π ~ π）
      let delta = curAngle - startAngle
      while (delta >  Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const cos = Math.cos(delta), sin = Math.sin(delta)
      const newQ = q.map(p => {
        const rx = p.x - pivotWorld.x, ry = p.y - pivotWorld.y
        return { x: pivotWorld.x + rx * cos - ry * sin, y: pivotWorld.y + rx * sin + ry * cos }
      }) as Quad
      this.store.setBaseQuad(this.drag.meshId, newQ)

    } else if (this.drag.target.kind === 'selRotate') {
      const { centroid, startAngle } = this.drag.target
      const curAngle = Math.atan2(pt.y - centroid.y, pt.x - centroid.x)
      let delta = curAngle - startAngle
      while (delta >  Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const cos = Math.cos(delta), sin = Math.sin(delta)
      // 旋轉所有選中端點
      const updates: Record<string, Quad> = {}
      for (const v of this._selectedVertices) {
        const sq = this.drag.multiStartQuads?.[v.objId]
        if (!sq) continue
        if (!updates[v.objId]) updates[v.objId] = [...sq] as Quad
        const p   = sq[v.cornerIndex]
        const rx  = p.x - centroid.x, ry = p.y - centroid.y
        updates[v.objId][v.cornerIndex] = {
          x: centroid.x + rx * cos - ry * sin,
          y: centroid.y + rx * sin + ry * cos,
        }
      }
      this.store.setBaseQuads(updates)
      // 旋轉把手立即跟隨游標，不等 React re-render
      this._drawSelGizmo(this._selectedVertices, pt)

    } else if (this.drag.target.kind === 'scale') {
      const { pivotWorld, startDist } = this.drag.target
      const dx2 = pt.x - pivotWorld.x, dy2 = pt.y - pivotWorld.y
      const curDist = Math.sqrt(dx2 * dx2 + dy2 * dy2)
      if (startDist < 1) return
      const s = curDist / startDist
      const newQ = q.map(p => ({
        x: pivotWorld.x + (p.x - pivotWorld.x) * s,
        y: pivotWorld.y + (p.y - pivotWorld.y) * s,
      })) as Quad
      this.store.setBaseQuad(this.drag.meshId, newQ)

    } else if (this.drag.target.kind === 'pivot') {
      const qm = this.meshes.get(this.drag.meshId)
      if (qm) {
        const newWorld = { x: this.drag.startPt.x + dx, y: this.drag.startPt.y + dy }
        this.store.setPivotUV(this.drag.meshId, worldToUV(newWorld, q))
      }
    }
  }

  private _onUp(e: { global: { x: number; y: number } }) {
    // 套索結束：計算選取頂點
    if (this._lassoStart) {
      const pt = e.global as Point
      const x1 = Math.min(pt.x, this._lassoStart.x)
      const y1 = Math.min(pt.y, this._lassoStart.y)
      const x2 = Math.max(pt.x, this._lassoStart.x)
      const y2 = Math.max(pt.y, this._lassoStart.y)
      this._lassoGfx.clear()
      this._lassoStart = null

      if (x2 - x1 > 4 || y2 - y1 > 4) {
        const verts: VertexRef[] = []
        for (const [id, mesh] of this.meshes) {
          const q = mesh.quad
          for (let i = 0; i < 4; i++) {
            const p = q[i]
            if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2)
              verts.push({ objId: id, cornerIndex: i })
          }
        }
        this.store.selectVertices(verts)
      } else {
        this.store.selectVertices([])
      }
      return
    }

    if (this.drag) {
      const kind = this.drag.target.kind
      if (this.drag.multiStartQuads) {
        for (const oid of Object.keys(this.drag.multiStartQuads))
          this.store.autoRecordKeyframe(oid)
      } else if (kind === 'body' || kind === 'corner' || kind === 'rotate' || kind === 'scale') {
        this.store.autoRecordKeyframe(this.drag.meshId)
      } else if (kind === 'selRotate') {
        const ids = [...new Set(this._selectedVertices.map(v => v.objId))]
        ids.forEach(id => this.store.autoRecordKeyframe(id))
      }
      this.drag = null
    }
  }

  // ── 遮罩 ─────────────────────────────────────────────────────────

  private _syncMasks(objects: Record<string, SceneObject>) {
    const W = this.app.screen.width
    const H = this.app.screen.height

    // 清除已不需要遮罩的 container
    for (const [id, qm] of this.meshes) {
      const obj = objects[id]
      if (!obj?.masks?.length && qm.container.mask !== null)
        qm.container.mask = null
    }

    for (const obj of Object.values(objects)) {
      const masks = obj.masks
      if (!masks?.length) continue
      const qm = this.meshes.get(obj.id)
      if (!qm) continue

      const entry  = masks[0]
      const maskQm = this.meshes.get(entry.maskObjectId)
      if (!maskQm) {
        if (qm.container.mask !== null) qm.container.mask = null
        continue
      }

      const key = `${obj.id}|${entry.maskObjectId}`
      let cached = this.maskGfxMap.get(key)

      // 模式切換（正 ↔ 反）→ 重建 AlphaMask（inverse 不同）
      if (cached && cached.mode !== entry.mode) {
        qm.container.mask = null
        cached.rt.destroy(true)
        this.maskGfxMap.delete(key)
        cached = undefined
      }

      if (!cached) {
        const rt      = RenderTexture.create({ width: W, height: H })
        const sprite  = new Sprite(rt)
        const inverse = entry.mode === 'negative'
        const am      = new AlphaMask({ mask: sprite, inverse })
        cached = { rt, sprite, am, mode: entry.mode }
        this.maskGfxMap.set(key, cached)
        qm.container.mask = am
      }

      try {
        // 正遮罩與反遮罩都把 PNG 的視覺層（含 alpha）render 到 RT
        // AlphaMask.inverse 控制「有 alpha → 顯示」或「有 alpha → 隱藏」
        maskQm.renderVisual(this.app.renderer, cached.rt, true, 'normal')
      } catch (err) {
        console.error('[_syncMasks] render error:', err)
      }
    }

    // 清理孤立的快取
    for (const [key, { rt }] of this.maskGfxMap) {
      const sep = key.indexOf('|')
      const oid = key.slice(0, sep)
      const mid = key.slice(sep + 1)
      const obj = objects[oid]
      if (!obj || !obj.masks?.some(m => m.maskObjectId === mid)) {
        const qm = this.meshes.get(oid)
        if (qm) qm.container.mask = null
        rt.destroy(true)
        this.maskGfxMap.delete(key)
      }
    }
  }

  // ── 套索選取 gizmo ─────────────────────────────────────────────────

  private _selCentroid(verts: VertexRef[]): Point | null {
    if (verts.length === 0) return null
    let sx = 0, sy = 0
    for (const v of verts) {
      const qm = this.meshes.get(v.objId)
      if (!qm) continue
      const p = qm.quad[v.cornerIndex]
      sx += p.x; sy += p.y
    }
    return { x: sx / verts.length, y: sy / verts.length }
  }

  private _drawSelGizmo(verts: VertexRef[], cursorPt?: Point) {
    this._selGfx.clear()
    if (verts.length < 2) {
      ;(this._selGfx as any)._rotHandle = undefined
      return
    }
    const centroid = this._selCentroid(verts)
    if (!centroid) return

    // 計算包圍框頂端中點
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const v of verts) {
      const qm = this.meshes.get(v.objId)
      if (!qm) continue
      const p = qm.quad[v.cornerIndex]
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
    }
    // 拖曳中：把手跟隨游標；靜止：放在頂端 36px 外
    const rh = cursorPt ?? { x: (minX + maxX) / 2, y: minY - 36 }

    this._selGfx
      .circle(rh.x, rh.y, 7).fill({ color: 0xffee00 })
      .circle(rh.x, rh.y, 7).stroke({ color: 0x000000, width: 1.5 })

    ;(this._selGfx as any)._rotHandle = rh
    ;(this._selGfx as any)._centroid  = centroid
  }

  private _onSelGizmoDown(e: { global: Point }) {
    if (this._selectedVertices.length < 2) return
    const rh       = (this._selGfx as any)._rotHandle as Point | undefined
    const centroid = (this._selGfx as any)._centroid  as Point | undefined
    if (!rh || !centroid) return
    const pt = e.global
    const dx = pt.x - rh.x, dy = pt.y - rh.y
    if (dx * dx + dy * dy > 14 * 14) return  // miss

    this.store.pushHistory()

    // 收集所有受影響物件的起始 quad
    const multiStartQuads: Record<string, Quad> = {}
    for (const v of this._selectedVertices) {
      if (!multiStartQuads[v.objId]) {
        const m = this.meshes.get(v.objId)
        if (m) multiStartQuads[v.objId] = [...m.quad] as Quad
      }
    }
    // 用第一個 objId 當 meshId（只是佔位，selRotate 不用它）
    const meshId = this._selectedVertices[0].objId
    this.drag = {
      meshId,
      target:   { kind: 'selRotate', centroid, startAngle: Math.atan2(pt.y - centroid.y, pt.x - centroid.x) },
      startPt:  { ...pt },
      startQuad: [...(this.meshes.get(meshId)?.quad ?? [{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}])] as Quad,
      multiStartQuads,
    }
  }
}
