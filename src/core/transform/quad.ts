import type { Point, Quad, UV } from '../model/types'

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function uvToWorld(uv: UV, quad: Quad): Point {
  const top    = lerp(quad[0], quad[1], uv.u)
  const bottom = lerp(quad[3], quad[2], uv.u)
  return lerp(top, bottom, uv.v)
}

export function quadCenter(quad: Quad): Point {
  return uvToWorld({ u: 0.5, v: 0.5 }, quad)
}

export function moveQuad(quad: Quad, dx: number, dy: number): Quad {
  return quad.map(p => ({ x: p.x + dx, y: p.y + dy })) as Quad
}

export function makeRectQuad(x: number, y: number, w: number, h: number): Quad {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

export function distanceSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

// 世界座標反算 UV（雙線性反求，Newton-Raphson 迭代，適用任意變形四邊形）
// clamp=true（預設）：UV 限制在 [0,1]，用於插銷/重心放置
// clamp=false：允許 UV 超出範圍（外插），用於變形器加算合成
export function worldToUV(pt: Point, quad: Quad, clamp = true): UV {
  const [tl, tr, br, bl] = quad
  let u = 0.5, v = 0.5

  for (let i = 0; i < 32; i++) {
    const mu = 1 - u, mv = 1 - v
    const px = mv * (mu * tl.x + u * tr.x) + v * (mu * bl.x + u * br.x)
    const py = mv * (mu * tl.y + u * tr.y) + v * (mu * bl.y + u * br.y)
    const rx = pt.x - px
    const ry = pt.y - py
    if (rx * rx + ry * ry < 1e-8) break

    // Jacobian ∂P/∂u, ∂P/∂v
    const ju_x = mv * (tr.x - tl.x) + v * (br.x - bl.x)
    const ju_y = mv * (tr.y - tl.y) + v * (br.y - bl.y)
    const jv_x = mu * (bl.x - tl.x) + u * (br.x - tr.x)
    const jv_y = mu * (bl.y - tl.y) + u * (br.y - tr.y)

    const det = ju_x * jv_y - ju_y * jv_x
    if (Math.abs(det) < 1e-10) break

    const du = (rx * jv_y - ry * jv_x) / det
    const dv = (ju_x * ry - ju_y * rx) / det
    u += du; v += dv
    if (clamp) { u = Math.max(0, Math.min(1, u)); v = Math.max(0, Math.min(1, v)) }
  }

  return { u, v }
}
