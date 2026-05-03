import { create } from 'zustand'
import type { SceneObject, Quad } from '../core/model/types'
import { makeRectQuad } from '../core/transform/quad'

interface SceneStore {
  objects: Record<string, SceneObject>
  selectedId: string | null
  addObject: (obj?: Partial<SceneObject>) => void
  updateQuad: (id: string, quad: Quad) => void
  select: (id: string | null) => void
  deleteSelected: () => void
}

let _nextId = 1
const COLORS = [0x4a9eff, 0xff6b6b, 0x6bff6b, 0xffcc4a, 0xcc6bff]

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects: {},
  selectedId: null,

  addObject: (overrides = {}) => {
    const id = `obj_${_nextId++}`
    const idx = Object.keys(get().objects).length
    const x = 80 + (idx % 5) * 40
    const y = 80 + Math.floor(idx / 5) * 40
    const obj: SceneObject = {
      id,
      name: `物件 ${idx + 1}`,
      quad: makeRectQuad(x, y, 160, 120),
      opacity: 1,
      tint: COLORS[idx % COLORS.length],
      parentId: null,
      children: [],
      zIndex: idx,
      ...overrides,
    }
    set(s => ({ objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  updateQuad: (id, quad) => {
    set(s => ({
      objects: { ...s.objects, [id]: { ...s.objects[id], quad } },
    }))
  },

  select: (id) => set({ selectedId: id }),

  deleteSelected: () => {
    const { selectedId, objects } = get()
    if (!selectedId) return
    const next = { ...objects }
    delete next[selectedId]
    set({ objects: next, selectedId: null })
  },
}))
