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

export interface DeformerBinding {
  deformerId:       string
  deformerRestQuad: Quad   // binding 時變形器的 quad（作為子物件形變的參考系）
}

export type MaskMode = 'positive'

export interface MaskEntry {
  maskObjectId: string
  mode: MaskMode
}

export interface SceneObject {
  id: string
  name: string
  quad:     Quad   // 渲染用世界座標（applyConstraints 每幀覆寫）
  baseQuad: Quad   // 基底座標：keyframe 存這個；對變形器子物件 = 變形器本地座標
  opacity: number
  tint: number
  parentId: string | null
  children: string[]
  zIndex: number
  pivot: Pivot
  pins: Pin[]
  textureUrl:    string | null
  textureName:   string | null
  isDeformer:    boolean
  deformerBinding: DeformerBinding | null
  masks:         MaskEntry[]
}
