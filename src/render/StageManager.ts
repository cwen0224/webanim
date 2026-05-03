import { Application, Graphics } from 'pixi.js'
import type { Point, Quad } from '../core/model/types'
import { QuadMesh } from './QuadMesh'
import { moveQuad } from '../core/transform/quad'
import type { SceneStore } from './types'

interface DragState {
  meshId: string
  target: { kind: 'corner'; index: number } | { kind: 'body' }
  startPt: Point
  startQuad: Quad
}

export class StageManager {
  readonly app: Application
  private meshes = new Map<string, QuadMesh>()
  private bg: Graphics
  private drag: DragState | null = null
  private store: SceneStore

  constructor(app: Application, store: SceneStore) {
    this.app = app
    this.store = store

    this.bg = new Graphics()
    this.bg.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x2a2a2a })
    this.bg.eventMode = 'static'
    this.bg.on('pointerdown', () => store.select(null))
    app.stage.addChild(this.bg)

    app.stage.eventMode = 'static'
    app.stage.on('pointermove', this._onMove.bind(this))
    app.stage.on('pointerup',   this._onUp.bind(this))
  }

  sync(
    objects: Record<string, import('../core/model/types').SceneObject>,
    selectedId: string | null,
  ) {
    // remove deleted
    for (const [id, qm] of this.meshes) {
      if (!objects[id]) {
        this.app.stage.removeChild(qm.container)
        this.meshes.delete(id)
      }
    }
    // add / update
    for (const obj of Object.values(objects)) {
      let qm = this.meshes.get(obj.id)
      if (!qm) {
        qm = new QuadMesh(obj.quad, obj.tint, obj.opacity)
        qm.container.eventMode = 'static'
        qm.container.on('pointerdown', (e) => {
          e.stopPropagation()
          this._onDown(e.global as Point, obj.id)
        })
        this.meshes.set(obj.id, qm)
        this.app.stage.addChild(qm.container)
      } else {
        qm.updateQuad(obj.quad)
      }
      qm.setSelected(obj.id === selectedId)
    }
  }

  private _onDown(pt: Point, id: string) {
    this.store.select(id)
    const qm = this.meshes.get(id)
    if (!qm) return
    const hit = qm.hitTest(pt)
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
    } else {
      const i = this.drag.target.index
      const newQ = [...q] as Quad
      newQ[i] = { x: q[i].x + dx, y: q[i].y + dy }
      this.store.updateQuad(this.drag.meshId, newQ)
    }
  }

  private _onUp() {
    this.drag = null
  }
}
