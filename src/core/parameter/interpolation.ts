import type { Quad, Point } from '../model/types'
import type { Parameter } from './types'
import { uvToWorld } from '../transform/quad'

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// 轉動優先插值：以重心為軸先旋轉，再線性補間剩餘的位移
function interpolateQuad(a: Quad, b: Quad, t: number, pivotUV: { u: number; v: number }): Quad {
  const pivotA = uvToWorld(pivotUV, a)
  const pivotB = uvToWorld(pivotUV, b)

  // 計算 a → b 的旋轉角（用第一條邊的方向向量）
  const edgeA = { x: a[1].x - a[0].x, y: a[1].y - a[0].y }
  const edgeB = { x: b[1].x - b[0].x, y: b[1].y - b[0].y }
  const angleA = Math.atan2(edgeA.y, edgeA.x)
  const angleB = Math.atan2(edgeB.y, edgeB.x)
  const angle  = angleA + (angleB - angleA) * t

  // 以插值後的重心位置為軸，先旋轉 a 的各頂點
  const pivotT = lerpPt(pivotA, pivotB, t)
  const cosA   = Math.cos(angleA)
  const sinA   = Math.sin(angleA)
  const cosT   = Math.cos(angle)
  const sinT   = Math.sin(angle)

  const rotated = a.map(p => {
    // 相對於 pivotA 的座標
    const rx = p.x - pivotA.x
    const ry = p.y - pivotA.y
    // 反旋轉回正軸（消除 a 本身的旋轉）
    const lx =  rx * cosA + ry * sinA
    const ly = -rx * sinA + ry * cosA
    // 套用目標角度並移到插值重心
    return {
      x: pivotT.x + lx * cosT - ly * sinT,
      y: pivotT.y + lx * sinT + ly * cosT,
    }
  }) as Quad

  // 再對旋轉後的結果與 b 做線性補間（處理剩餘的縮放/梯形變形）
  return rotated.map((p, i) => lerpPt(p, b[i], t)) as Quad
}

// 計算一個參數在目前值下，各綁定物件的插值 quad
export function evaluateParameter(
  param: Parameter,
  objectPivotUVs: Record<string, { u: number; v: number }>,
): Record<string, Quad> {
  const result: Record<string, Quad> = {}
  if (param.keyframes.length === 0) return result

  const sorted = [...param.keyframes].sort((a, b) => a.t - b.t)
  const t      = param.value

  // 超出範圍：取邊界值
  if (t <= sorted[0].t) {
    for (const id of param.boundObjectIds) {
      if (sorted[0].quads[id]) result[id] = sorted[0].quads[id]
    }
    return result
  }
  if (t >= sorted[sorted.length - 1].t) {
    const last = sorted[sorted.length - 1]
    for (const id of param.boundObjectIds) {
      if (last.quads[id]) result[id] = last.quads[id]
    }
    return result
  }

  // 找前後兩個關鍵幀
  let lo = sorted[0], hi = sorted[1]
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].t && t <= sorted[i + 1].t) {
      lo = sorted[i]
      hi = sorted[i + 1]
      break
    }
  }

  const frac = (t - lo.t) / (hi.t - lo.t)

  for (const id of param.boundObjectIds) {
    const qa = lo.quads[id]
    const qb = hi.quads[id]
    if (qa && qb) {
      result[id] = interpolateQuad(qa, qb, frac, objectPivotUVs[id] ?? { u: 0.5, v: 0.5 })
    }
  }

  return result
}
