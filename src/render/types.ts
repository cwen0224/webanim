import type { Quad } from '../core/model/types'
import type { EditorMode } from '../store/sceneStore'

export interface SceneStore {
  select:     (id: string | null) => void
  updateQuad: (id: string, quad: Quad) => void
  setPivotUV: (id: string, uv: { u: number; v: number }) => void
  addPin:     (id: string, uv: { u: number; v: number }) => string
  bindPin:    (objectId: string, pinId: string, targetObjectId: string) => void
  setMode:    (mode: EditorMode) => void
}
