import type { Quad, SceneObject } from '../model/types'
import { uvToWorld, worldToUV, moveQuad } from '../transform/quad'

export function applyConstraints(
  objects: Record<string, SceneObject>
): Record<string, SceneObject> {
  const result = { ...objects }

  // ── Step 1: 變形器約束 ─────────────────────────────────────────────
  // 讀 baseQuad（變形器本地座標），映射到 deformer 目前 quad 的世界座標，
  // 寫入 quad（僅用於渲染 / 碰撞），不改動 baseQuad。
  for (const obj of Object.values(result)) {
    if (!obj.deformerBinding) continue
    const deformer = result[obj.deformerBinding.deformerId]
    if (!deformer) continue
    const { deformerRestQuad } = obj.deformerBinding
    result[obj.id] = {
      ...result[obj.id],
      quad: obj.baseQuad.map(p =>
        uvToWorld(worldToUV(p, deformerRestQuad, false), deformer.quad)
      ) as Quad,
    }
  }

  // ── Step 2: 插銷約束 ─────────────────────────────────────────────
  for (const parent of Object.values(result)) {
    for (const pin of parent.pins) {
      if (!pin.boundToObjectId) continue
      const child = result[pin.boundToObjectId]
      if (!child) continue

      const pinWorld   = uvToWorld(pin.uv, result[parent.id].quad)
      const pivotWorld = uvToWorld(child.pivot.uv, child.quad)
      const dx = pinWorld.x - pivotWorld.x
      const dy = pinWorld.y - pivotWorld.y

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        const movedQuad = moveQuad(child.quad, dx, dy)
        result[child.id] = { ...child, quad: movedQuad, baseQuad: movedQuad }
      }
    }
  }

  return result
}
