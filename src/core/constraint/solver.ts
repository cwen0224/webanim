import type { SceneObject } from '../model/types'
import { uvToWorld, moveQuad } from '../transform/quad'

// 純函數：輸入物件表，輸出套用重心插銷約束後的物件表
export function applyConstraints(
  objects: Record<string, SceneObject>
): Record<string, SceneObject> {
  const result = { ...objects }

  // 找出所有「有插銷且已綁定」的關係，依父子順序排列
  // 每個 pin 的 boundToObjectId 指向的物件是子件（從動件）
  for (const parent of Object.values(objects)) {
    for (const pin of parent.pins) {
      if (!pin.boundToObjectId) continue
      const child = result[pin.boundToObjectId]
      if (!child) continue

      // 插銷的世界座標（依父件的 quad 計算）
      const pinWorld   = uvToWorld(pin.uv, result[parent.id].quad)
      // 子件重心的世界座標
      const pivotWorld = uvToWorld(child.pivot.uv, child.quad)

      // 平移子件，使重心對齊插銷
      const dx = pinWorld.x - pivotWorld.x
      const dy = pinWorld.y - pivotWorld.y

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        result[child.id] = {
          ...child,
          quad: moveQuad(child.quad, dx, dy),
        }
      }
    }
  }

  return result
}
