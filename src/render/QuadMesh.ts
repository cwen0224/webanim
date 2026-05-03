import { Graphics, Container } from 'pixi.js'
import type { Quad, Point } from '../core/model/types'
import { distanceSq } from '../core/transform/quad'

const HANDLE_RADIUS = 8
const HANDLE_HIT    = 16

export type DragTarget =
  | { kind: 'corner'; index: number }
  | { kind: 'body' }

export class QuadMesh {
  readonly container: Container
  private body:    Graphics
  private overlay: Graphics
  private _quad:   Quad
  private _tint:   number
  private _opacity: number
  private _selected = false

  constructor(quad: Quad, tint: number, opacity: number) {
    this._quad    = quad
    this._tint    = tint
    this._opacity = opacity

    this.container = new Container()
    this.body      = new Graphics()
    this.overlay   = new Graphics()
    this.container.addChild(this.body)
    this.container.addChild(this.overlay)

    this._redrawBody()
  }

  get quad() { return this._quad }

  setSelected(v: boolean) {
    this._selected = v
    this._redrawOverlay()
  }

  updateQuad(quad: Quad) {
    this._quad = quad
    this._redrawBody()
    this._redrawOverlay()
  }

  hitTest(pt: Point): DragTarget | null {
    if (this._selected) {
      for (let i = 0; i < 4; i++) {
        if (distanceSq(pt, this._quad[i]) <= HANDLE_HIT ** 2)
          return { kind: 'corner', index: i }
      }
    }
    if (this._pointInQuad(pt)) return { kind: 'body' }
    return null
  }

  private _redrawBody() {
    const q = this._quad
    this.body.clear()
    this.body
      .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
      .fill({ color: this._tint, alpha: this._opacity })
  }

  private _redrawOverlay() {
    const q = this._quad
    this.overlay.clear()
    if (!this._selected) return

    // 外框
    this.overlay
      .poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y])
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 })

    // 角落控制點
    for (const p of q) {
      this.overlay
        .circle(p.x, p.y, HANDLE_RADIUS)
        .fill({ color: 0xffffff })
        .circle(p.x, p.y, HANDLE_RADIUS)
        .stroke({ color: 0x4a9eff, width: 2 })
    }
  }

  private _pointInQuad(pt: Point): boolean {
    const q = this._quad
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4]
      const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x)
      if (cross < 0) return false
    }
    return true
  }
}
