import { Application, Graphics } from 'pixi.js'
import type { Point, Quad, SceneObject } from '../core/model/types'
import { QuadMesh } from './QuadMesh'
import { moveQuad, worldToUV, uvToWorld } from '../core/transform/quad'
import type { EditorMode } from '../store/sceneStore'

interface StoreActions {
  select:              (id: string | null) => void
  setBaseQuad:         (id: string, quad: Quad) => void   // 繞過參數，直接設 quad
  autoRecordKeyframe:  (id: string) => void               // 拖完後自動記錄關鍵幀
  setPivotUV:          (id: string, uv: { u: number; v: number }) => void
  addPin:              (id: string, uv: { u: number; v: number }) => string
  bindPin:             (objectId: string, pinId: string, targetObjectId: string) => void
  setMode:             (mode: EditorMode) => void
}

type DragKind =
  | { kind: 'corner'; index: number }
  | { kind: 'pivot' }
  | { kind: 'rotate'; pivotWorld: Point; startAngle: number }
  | { kind: 'body' }

interface DragState {
  meshId:    string
  target:    DragKind
  startPt:   Point
  startQuad: Quad
}

export class StageManager {
  readonly app: Application
  private meshes = new Map<string, QuadMesh>()
  private bg: Graphics
  private drag: DragState | null = null
  private store: StoreActions
  private _pendingBind: { objectId: string; pinId: string } | null = null
  private _mode: EditorMode = 'select'

  constructor(app: Application, store: StoreActions) {
    this.app   = app
    this.store = store

    this.bg = new Graphics()
    this.bg.rect(0, 0, 4096, 4096).fill({ color: 0x2a2a2a })
    this.bg.eventMode = 'static'
    this.bg.on('pointerdown', (e) => this._onBgClick(e.global as Point))
    app.stage.addChild(this.bg)

    app.stage.eventMode = 'static'
    app.stage.on('pointermove', this._onMove.bind(this))
    app.stage.on('pointerup',   this._onUp.bind(this))
  }

  sync(
    objects: Record<string, SceneObject>,
    selectedId: string | null,
    mode: EditorMode,
    showJoints: boolean,
  ) {
    this._mode = mode

    for (const [id, qm] of this.meshes) {
      if (!objects[id]) { this.app.stage.removeChild(qm.container); this.meshes.delete(id) }
    }

    const sorted = Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
    for (const obj of sorted) {
      let qm = this.meshes.get(obj.id)
      if (!qm) {
        qm = new QuadMesh(obj)
        qm.container.eventMode = 'static'
        qm.container.on('pointerdown', (e) => {
          e.stopPropagation()
          this._onObjectDown(e.global as Point, obj.id, this._mode)
        })
        this.meshes.set(obj.id, qm)
        this.app.stage.addChild(qm.container)
      }
      qm.update(obj, obj.id === selectedId, showJoints)
    }
  }

  setPendingBind(objectId: string, pinId: string) { this._pendingBind = { objectId, pinId } }
  clearPendingBind()                               { this._pendingBind = null }

  private _onBgClick(_pt: Point) {
    if (this._pendingBind) { this._pendingBind = null; this.store.setMode('select'); return }
    this.store.select(null)
  }

  private _onObjectDown(pt: Point, id: string, mode: EditorMode) {
    if (mode === 'bind' && this._pendingBind && this._pendingBind.objectId !== id) {
      this.store.bindPin(this._pendingBind.objectId, this._pendingBind.pinId, id)
      this._pendingBind = null
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
    const hit = qm.hitTest(pt, true)
    if (!hit) return

    if (hit.kind === 'rotate') {
      const pivotWorld = uvToWorld(qm['_obj' as never] ? (qm as any)._obj.pivot.uv : { u: 0.5, v: 0.5 }, qm.quad)
      this.drag = {
        meshId: id, startPt: { ...pt }, startQuad: [...qm.quad] as Quad,
        target: { kind: 'rotate', pivotWorld, startAngle: Math.atan2(pt.y - pivotWorld.y, pt.x - pivotWorld.x) },
      }
    } else {
      this.drag = { meshId: id, target: hit, startPt: { ...pt }, startQuad: [...qm.quad] as Quad }
    }
  }

  private _onMove(e: { global: { x: number; y: number } }) {
    if (!this.drag) return
    const pt = e.global as Point
    const dx = pt.x - this.drag.startPt.x
    const dy = pt.y - this.drag.startPt.y
    const q  = [...this.drag.startQuad] as Quad

    if (this.drag.target.kind === 'body') {
      this.store.setBaseQuad(this.drag.meshId, moveQuad(q, dx, dy))

    } else if (this.drag.target.kind === 'corner') {
      const i = this.drag.target.index
      const newQ = [...q] as Quad
      newQ[i] = { x: q[i].x + dx, y: q[i].y + dy }
      this.store.setBaseQuad(this.drag.meshId, newQ)

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

    } else if (this.drag.target.kind === 'pivot') {
      const qm = this.meshes.get(this.drag.meshId)
      if (qm) {
        const newWorld = { x: this.drag.startPt.x + dx, y: this.drag.startPt.y + dy }
        this.store.setPivotUV(this.drag.meshId, worldToUV(newWorld, q))
      }
    }
  }

  private _onUp() {
    if (this.drag) {
      const id = this.drag.meshId
      const kind = this.drag.target.kind
      // 拖完後，若有參數綁定就自動更新關鍵幀
      if (kind === 'body' || kind === 'corner' || kind === 'rotate') {
        this.store.autoRecordKeyframe(id)
      }
      this.drag = null
    }
  }
}
