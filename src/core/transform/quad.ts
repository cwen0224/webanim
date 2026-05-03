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
