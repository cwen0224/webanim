import { create } from 'zustand'
import type { SceneObject, Quad, UV, Pin } from '../core/model/types'
import { makeRectQuad, uvToWorld } from '../core/transform/quad'
import { applyConstraints } from '../core/constraint/solver'

export type EditorMode = 'select' | 'addPin' | 'bind'

interface SceneStore {
  objects: Record<string, SceneObject>
  selectedId: string | null
  mode: EditorMode
  showJoints: boolean

  // 物件操作
  addObject:       (obj?: Partial<SceneObject>) => void
  updateQuad:      (id: string, quad: Quad) => void
  select:          (id: string | null) => void
  deleteSelected:  () => void

  // 重心
  setPivotUV: (id: string, uv: UV) => void

  // 插銷
  addPin:    (id: string, uv: UV) => string   // 回傳 pin id
  removePin: (id: string, pinId: string) => void
  bindPin:   (objectId: string, pinId: string, targetObjectId: string) => void
  unbindPin: (objectId: string, pinId: string) => void

  // UI
  setMode:       (mode: EditorMode) => void
  toggleJoints:  () => void
}

let _nextId  = 1
let _pinId   = 1
const COLORS = [0x4a9eff, 0xff6b6b, 0x6bff6b, 0xffcc4a, 0xcc6bff]

function withConstraints(
  objects: Record<string, SceneObject>
): Record<string, SceneObject> {
  return applyConstraints(objects)
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects: {},
  selectedId: null,
  mode: 'select',
  showJoints: true,

  addObject: (overrides = {}) => {
    const id  = `obj_${_nextId++}`
    const idx = Object.keys(get().objects).length
    const x   = 80 + (idx % 4) * 50
    const y   = 80 + Math.floor(idx / 4) * 50
    const obj: SceneObject = {
      id,
      name:     `物件 ${idx + 1}`,
      quad:     makeRectQuad(x, y, 160, 120),
      opacity:  1,
      tint:     COLORS[idx % COLORS.length],
      parentId: null,
      children: [],
      zIndex:   idx,
      pivot:    { uv: { u: 0.5, v: 0.5 }, name: '重心' },
      pins:     [],
      ...overrides,
    }
    set(s => ({ objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  updateQuad: (id, quad) => {
    set(s => ({
      objects: withConstraints({ ...s.objects, [id]: { ...s.objects[id], quad } }),
    }))
  },

  select: (id) => set({ selectedId: id }),

  deleteSelected: () => {
    const { selectedId, objects } = get()
    if (!selectedId) return
    const next = { ...objects }
    // 解除所有指向此物件的綁定
    for (const obj of Object.values(next)) {
      obj.pins = obj.pins.map(p =>
        p.boundToObjectId === selectedId ? { ...p, boundToObjectId: null } : p
      )
    }
    delete next[selectedId]
    set({ objects: next, selectedId: null })
  },

  setPivotUV: (id, uv) => {
    set(s => ({
      objects: withConstraints({
        ...s.objects,
        [id]: { ...s.objects[id], pivot: { ...s.objects[id].pivot, uv } },
      }),
    }))
  },

  addPin: (id, uv) => {
    const pinId = `pin_${_pinId++}`
    const pin: Pin = { id: pinId, name: `插銷 ${_pinId - 1}`, uv, boundToObjectId: null }
    set(s => ({
      objects: {
        ...s.objects,
        [id]: { ...s.objects[id], pins: [...s.objects[id].pins, pin] },
      },
    }))
    return pinId
  },

  removePin: (id, pinId) => {
    set(s => ({
      objects: {
        ...s.objects,
        [id]: {
          ...s.objects[id],
          pins: s.objects[id].pins.filter(p => p.id !== pinId),
        },
      },
    }))
  },

  bindPin: (objectId, pinId, targetObjectId) => {
    set(s => ({
      objects: withConstraints({
        ...s.objects,
        [objectId]: {
          ...s.objects[objectId],
          pins: s.objects[objectId].pins.map(p =>
            p.id === pinId ? { ...p, boundToObjectId: targetObjectId } : p
          ),
        },
      }),
    }))
  },

  unbindPin: (objectId, pinId) => {
    set(s => ({
      objects: {
        ...s.objects,
        [objectId]: {
          ...s.objects[objectId],
          pins: s.objects[objectId].pins.map(p =>
            p.id === pinId ? { ...p, boundToObjectId: null } : p
          ),
        },
      },
    }))
  },

  setMode:      (mode) => set({ mode }),
  toggleJoints: ()     => set(s => ({ showJoints: !s.showJoints })),
}))
