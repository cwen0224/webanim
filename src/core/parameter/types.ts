import type { Quad } from '../model/types'

export interface Keyframe {
  t: number                        // 此關鍵幀對應的參數值
  quads: Record<string, Quad>      // objectId → 此 t 值下的四頂點狀態
}

export interface Parameter {
  id: string
  name: string
  min: number
  max: number
  value: number                    // 目前滑桿值
  boundObjectIds: string[]         // 受此參數影響的物件
  keyframes: Keyframe[]            // 依 t 排序
}
