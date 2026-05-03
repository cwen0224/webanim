import { Graphics, Container } from 'pixi.js'
import type { Quad, Point, SceneObject } from '../core/model/types'
import { uvToWorld, distanceSq } from '../core/transform/quad'

const HANDLE_RADIUS = 8
const HANDLE_HIT    = 14
const PIVOT_RADIUS  = 7
const PIN_SIZE      = 7

export type DragTarget =
  | { kind: 'corner'; index: number }
  | { kind: 'pivot' }
  | { kind: 'body' }

export class QuadMesh {
  readonly container: Container
  private body:    Graphics
  private overlay: Graphics
  private joints:  Graphics
  private _obj: SceneObject

  constructor(obj: SceneObject) {
    this._obj     = obj
    this.container = new Container()
    this.body      = new Graphics()
    this.overlay   = new Graphics()
    this.joints    = new Graphics()
    this.container.addChild(this.body)
    this.container.addChild(this.overlay)
    this.container.addChild(this.joints)
    this._redrawBody()
  }

  get quad() { return this._obj.quad }

  update(obj: SceneObject, selected: boolean, showJoints: boolean) {
    this._obj = obj
    this._redrawBody()
    this._redrawOverlay(selected)
    this._redrawJoints(showJoints)
  }

  hitTest(pt: Point, selected: boolean): DragTarget | null {
    const q = this._obj.quad
    if (selected) {
      // 角落控制點
      for (let i = 0; i < 4; i++) {
        if (distanceSq(pt, q[i]) <= HANDLE_HIT ** 2)
          return { kind: 'corner', index: i }
      }
      // 重心
      const pivotWorld = uvToWorld(this._obj.pivot.uv, q)
      if (distanceSq(pt, pivotWorld) <= HANDLE_HIT ** 2)
        return { kind: 'pivot' }
    }
    if (this._pointInQuad(pt)) return { kind: 'body' }
    return null
  }

  // UV 座標轉世界座標（供外部計算插銷位置用）
  uvToWorld(uv: { u: number; v: number }): Point {
    return uvToWorld(uv, this._obj.quad)
  }

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
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.85 })

    // 角落控制點
    for (const p of q) {
      this.overlay
        .circle(p.x, p.y, HANDLE_RADIUS)
        .fill({ color: 0xffffff })
        .circle(p.x, p.y, HANDLE_RADIUS)
        .stroke({ color: 0x4a9eff, width: 2 })
    }
  }

  private _redrawJoints(show: boolean) {
    this.joints.clear()
    if (!show) return
    const q = this._obj.quad

    // 重心：橘色十字 + 圓圈
    const pv = uvToWorld(this._obj.pivot.uv, q)
    this.joints
      .circle(pv.x, pv.y, PIVOT_RADIUS)
      .stroke({ color: 0xff8800, width: 2, alpha: 0.9 })
    this.joints
      .moveTo(pv.x - PIVOT_RADIUS - 3, pv.y)
      .lineTo(pv.x + PIVOT_RADIUS + 3, pv.y)
      .stroke({ color: 0xff8800, width: 1.5, alpha: 0.9 })
    this.joints
      .moveTo(pv.x, pv.y - PIVOT_RADIUS - 3)
      .lineTo(pv.x, pv.y + PIVOT_RADIUS + 3)
      .stroke({ color: 0xff8800, width: 1.5, alpha: 0.9 })

    // 插銷：藍色菱形
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

  private _pointInQuad(pt: Point): boolean {
    const q = this._obj.quad
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4]
      const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x)
      if (cross < 0) return false
    }
    return true
  }
}
