import { Mesh, MeshGeometry, Texture, Graphics, Container } from 'pixi.js'
import type { Quad, Point } from '../core/model/types'
import { distanceSq } from '../core/transform/quad'

const HANDLE_RADIUS = 8
const HANDLE_HIT    = 16

export type DragTarget =
  | { kind: 'corner'; index: number }
  | { kind: 'body' }

export class QuadMesh {
  readonly container: Container
  private mesh: Mesh<MeshGeometry>
  private outline: Graphics
  private handles: Graphics
  private _quad: Quad
  private _selected = false

  constructor(quad: Quad, tint: number, opacity: number) {
    this._quad = quad
    this.container = new Container()

    // --- mesh ---
    const geo = new MeshGeometry({
      positions: this._flatPositions(),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    })
    this.mesh = new Mesh<MeshGeometry>({ geometry: geo, texture: Texture.WHITE })
    this.mesh.tint = tint
    this.mesh.alpha = opacity
    this.container.addChild(this.mesh)

    // --- outline + handles (drawn on demand) ---
    this.outline = new Graphics()
    this.handles = new Graphics()
    this.container.addChild(this.outline)
    this.container.addChild(this.handles)

    this._redrawOverlay()
  }

  get quad() { return this._quad }

  setSelected(v: boolean) {
    this._selected = v
    this._redrawOverlay()
  }

  updateQuad(quad: Quad) {
    this._quad = quad
    const pos = this.mesh.geometry.getBuffer('aPosition')
    const flat = this._flatPositions()
    for (let i = 0; i < flat.length; i++) pos.data[i] = flat[i]
    pos.update()
    this._redrawOverlay()
  }

  // returns which drag target was hit, or null
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

  // ── private ──────────────────────────────────────────────────────────

  private _flatPositions(): Float32Array {
    const q = this._quad
    return new Float32Array([
      q[0].x, q[0].y,
      q[1].x, q[1].y,
      q[2].x, q[2].y,
      q[3].x, q[3].y,
    ])
  }

  private _redrawOverlay() {
    this.outline.clear()
    this.handles.clear()
    if (!this._selected) return

    const q = this._quad
    // outline
    this.outline
      .moveTo(q[0].x, q[0].y)
      .lineTo(q[1].x, q[1].y)
      .lineTo(q[2].x, q[2].y)
      .lineTo(q[3].x, q[3].y)
      .lineTo(q[0].x, q[0].y)
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 })

    // corner handles
    for (const p of q) {
      this.handles
        .circle(p.x, p.y, HANDLE_RADIUS)
        .fill({ color: 0xffffff })
        .circle(p.x, p.y, HANDLE_RADIUS)
        .stroke({ color: 0x4a9eff, width: 2 })
    }
  }

  // simple point-in-convex-quad test
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
