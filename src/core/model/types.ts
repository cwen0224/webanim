export type Point = { x: number; y: number }

// 四頂點順序：左上、右上、右下、左下
export type Quad = [Point, Point, Point, Point]

export type UV = { u: number; v: number }

export interface SceneObject {
  id: string
  name: string
  quad: Quad
  opacity: number
  tint: number       // 測試用顏色，之後換成 assetUrl
  parentId: string | null
  children: string[]
  zIndex: number
}
