import type { Quad } from '../core/model/types'

export interface SceneStore {
  select: (id: string | null) => void
  updateQuad: (id: string, quad: Quad) => void
}
