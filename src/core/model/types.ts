export type Point = { x: number; y: number }

// 四頂點順序：左上、右上、右下、左下
export type Quad = [Point, Point, Point, Point]

// UV 相對座標（0~1，相對於物件四邊形）
export type UV = { u: number; v: number }

export interface Pivot {
  uv: UV      // 旋轉軸心，預設正中央 (0.5, 0.5)
  name: string
}

export interface Pin {
  id: string
  name: string
  uv: UV
  boundToObjectId: string | null  // 綁定哪個物件的重心
}

export interface SceneObject {
  id: string
  name: string
  quad: Quad
  opacity: number
  tint: number
  parentId: string | null
  children: string[]
  zIndex: number
  pivot: Pivot
  pins: Pin[]
}
