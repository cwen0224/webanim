import { Application, Graphics } from 'pixi.js'
import type { Point, Quad, SceneObject } from '../core/model/types'
import { QuadMesh } from './QuadMesh'
import { moveQuad } from '../core/transform/quad'
import type { EditorMode } from '../store/sceneStore'

interface StoreActions {
  select:     (id: string | null) => void
  updateQuad: (id: string, quad: Quad) => void
  setPivotUV: (id: string, uv: { u: number; v: number }) => void
  addPin:     (id: string, uv: { u: number; v: number }) => string
  bindPin:    (objectId: string, pinId: string, targetObjectId: string) => void
  setMode:    (mode: EditorMode) => void
}

interface DragState {
  meshId:    string
  target:    { kind: 'corner'; index: number } | { kind: 'pivot' } | { kind: 'body' }
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
    // 移除已刪除的物件
    for (const [id, qm] of this.meshes) {
      if (!objects[id]) {
        this.app.stage.removeChild(qm.container)
        this.meshes.delete(id)
      }
    }
    // 新增 / 更新
    const sorted = Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
    for (const obj of sorted) {
      let qm = this.meshes.get(obj.id)
      if (!qm) {
        qm = new QuadMesh(obj)
        qm.container.eventMode = 'static'
        qm.container.on('pointerdown', (e) => {
          e.stopPropagation()
          this._onObjectDown(e.global as Point, obj.id, mode)
        })
        this.meshes.set(obj.id, qm)
        this.app.stage.addChild(qm.container)
      }
      qm.update(obj, obj.id === selectedId, showJoints)
    }
  }

  setPendingBind(objectId: string, pinId: string) {
    this._pendingBind = { objectId, pinId }
  }

  clearPendingBind() {
    this._pendingBind = null
  }

  private _onBgClick(_pt: Point) {
    if (this._pendingBind) {
      this._pendingBind = null
      this.store.setMode('select')
      return
    }
    this.store.select(null)
  }

  private _onObjectDown(pt: Point, id: string, mode: EditorMode) {
    // bind 模式：點擊目標物件的重心完成綁定
    if (mode === 'bind' && this._pendingBind && this._pendingBind.objectId !== id) {
      this.store.bindPin(this._pendingBind.objectId, this._pendingBind.pinId, id)
      this._pendingBind = null
      this.store.setMode('select')
      return
    }

    // addPin 模式：在此物件上點擊位置新增插銷
    if (mode === 'addPin') {
      const qm = this.meshes.get(id)
      if (qm) {
        const uv = this._worldToUV(pt, qm.quad)
        this.store.addPin(id, uv)
      }
      this.store.setMode('select')
      this.store.select(id)
      return
    }

    // select 模式
    this.store.select(id)
    const qm = this.meshes.get(id)
    if (!qm) return
    const hit = qm.hitTest(pt, true)
    if (!hit) return
    this.drag = { meshId: id, target: hit, startPt: { ...pt }, startQuad: [...qm.quad] as Quad }
  }

  private _onMove(e: { global: { x: number; y: number } }) {
    if (!this.drag) return
    const pt = e.global as Point
    const dx = pt.x - this.drag.startPt.x
    const dy = pt.y - this.drag.startPt.y
    const q  = [...this.drag.startQuad] as Quad

    if (this.drag.target.kind === 'body') {
      this.store.updateQuad(this.drag.meshId, moveQuad(q, dx, dy))
    } else if (this.drag.target.kind === 'corner') {
      const i = this.drag.target.index
      const newQ = [...q] as Quad
      newQ[i] = { x: q[i].x + dx, y: q[i].y + dy }
      this.store.updateQuad(this.drag.meshId, newQ)
    } else if (this.drag.target.kind === 'pivot') {
      // 拖移重心：更新 UV 座標
      const qm = this.meshes.get(this.drag.meshId)
      if (qm) {
        const newWorld = { x: this.drag.startPt.x + dx, y: this.drag.startPt.y + dy }
        const uv = this._worldToUV(newWorld, q)
        this.store.setPivotUV(this.drag.meshId, uv)
      }
    }
  }

  private _onUp() { this.drag = null }

  // 將世界座標換算為 quad 的 UV 座標（雙線性反算，近似）
  private _worldToUV(pt: Point, quad: Quad): { u: number; v: number } {
    const [tl, tr, , bl] = quad
    const w = Math.sqrt((tr.x - tl.x) ** 2 + (tr.y - tl.y) ** 2) || 1
    const h = Math.sqrt((bl.x - tl.x) ** 2 + (bl.y - tl.y) ** 2) || 1
    const dx = pt.x - tl.x
    const dy = pt.y - tl.y
    return {
      u: Math.max(0, Math.min(1, dx / w)),
      v: Math.max(0, Math.min(1, dy / h)),
    }
  }
}
