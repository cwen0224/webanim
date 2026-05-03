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
  const pivotT = lerpPt(pivotA, pivotB, t)

  // 用第一條邊方向向量計算旋轉差，正規化到 -π ~ π 取最短弧
  const edgeA  = { x: a[1].x - a[0].x, y: a[1].y - a[0].y }
  const edgeB  = { x: b[1].x - b[0].x, y: b[1].y - b[0].y }
  const angleA = Math.atan2(edgeA.y, edgeA.x)
  let   delta  = Math.atan2(edgeB.y, edgeB.x) - angleA
  while (delta >  Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  const cosA = Math.cos(angleA),        sinA = Math.sin(angleA)
  const cosT = Math.cos(angleA + delta * t), sinT = Math.sin(angleA + delta * t)
  const cos1 = Math.cos(angleA + delta),     sin1 = Math.sin(angleA + delta)

  return a.map((p, i) => {
    // 將頂點解旋轉到局部座標（消除 a 自身的旋轉）
    const rx =  (p.x - pivotA.x) * cosA + (p.y - pivotA.y) * sinA
    const ry = -(p.x - pivotA.x) * sinA + (p.y - pivotA.y) * cosA

    // 套用插值角度，以插值重心為中心
    const rotT = {
      x: pivotT.x + rx * cosT - ry * sinT,
      y: pivotT.y + rx * sinT + ry * cosT,
    }
    // a 完整旋轉到 t=1 的位置（不是 b，是純旋轉結果）
    const rot1 = {
      x: pivotB.x + rx * cos1 - ry * sin1,
      y: pivotB.y + rx * sin1 + ry * cos1,
    }
    // 最終 = 旋轉插值 + t × 殘差（縮放 / 梯形形狀差）
    // 純旋轉時 rot1 == b[i]，殘差為零，不會縮
    return {
      x: rotT.x + t * (b[i].x - rot1.x),
      y: rotT.y + t * (b[i].y - rot1.y),
    }
  }) as Quad
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
