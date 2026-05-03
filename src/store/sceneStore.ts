import { create } from 'zustand'
import type { SceneObject, Quad, UV, Pin } from '../core/model/types'
import type { Parameter, Keyframe } from '../core/parameter/types'
import { makeRectQuad } from '../core/transform/quad'
import { applyConstraints } from '../core/constraint/solver'
import { evaluateParameter } from '../core/parameter/interpolation'

export type EditorMode = 'select' | 'addPin' | 'bind'

interface SceneStore {
  objects:    Record<string, SceneObject>
  parameters: Record<string, Parameter>
  selectedId:      string | null
  selectedParamId: string | null
  mode:       EditorMode
  showJoints: boolean

  // 物件
  addObject:       (obj?: Partial<SceneObject>) => void
  updateQuad:      (id: string, quad: Quad) => void
  select:          (id: string | null) => void
  deleteSelected:  () => void

  // 重心與插銷
  setPivotUV: (id: string, uv: UV) => void
  addPin:     (id: string, uv: UV) => string
  removePin:  (id: string, pinId: string) => void
  bindPin:    (objectId: string, pinId: string, targetObjectId: string) => void
  unbindPin:  (objectId: string, pinId: string) => void

  // 參數
  addParameter:         (name: string, min: number, max: number) => string
  deleteParameter:      (paramId: string) => void
  setParameterValue:    (paramId: string, value: number) => void
  selectParameter:      (paramId: string | null) => void
  bindObjectToParam:    (paramId: string, objectId: string) => void
  unbindObjectFromParam:(paramId: string, objectId: string) => void
  recordKeyframe:       (paramId: string) => void
  deleteKeyframe:       (paramId: string, t: number) => void

  // UI
  setMode:      (mode: EditorMode) => void
  toggleJoints: () => void
}

let _nextId   = 1
let _pinId    = 1
let _paramId  = 1
const COLORS  = [0x4a9eff, 0xff6b6b, 0x6bff6b, 0xffcc4a, 0xcc6bff]

// 套用所有參數的插值，再跑約束求解，回傳最終 objects
function applyAllParameters(
  objects: Record<string, SceneObject>,
  parameters: Record<string, Parameter>,
): Record<string, SceneObject> {
  let result = { ...objects }

  for (const param of Object.values(parameters)) {
    if (param.keyframes.length < 2) continue
    const pivotUVs: Record<string, { u: number; v: number }> = {}
    for (const id of param.boundObjectIds) {
      if (result[id]) pivotUVs[id] = result[id].pivot.uv
    }
    const interpolated = evaluateParameter(param, pivotUVs)
    for (const [id, quad] of Object.entries(interpolated)) {
      if (result[id]) result[id] = { ...result[id], quad }
    }
  }

  return applyConstraints(result)
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects:         {},
  parameters:      {},
  selectedId:      null,
  selectedParamId: null,
  mode:            'select',
  showJoints:      true,

  // ── 物件 ──────────────────────────────────────────────────────────
  addObject: (overrides = {}) => {
    const id  = `obj_${_nextId++}`
    const idx = Object.keys(get().objects).length
    const x   = 80 + (idx % 4) * 50
    const y   = 80 + Math.floor(idx / 4) * 50
    const obj: SceneObject = {
      id, name: `物件 ${idx + 1}`,
      quad:     makeRectQuad(x, y, 160, 120),
      opacity:  1,
      tint:     COLORS[idx % COLORS.length],
      parentId: null, children: [], zIndex: idx,
      pivot:    { uv: { u: 0.5, v: 0.5 }, name: '重心' },
      pins:     [],
      ...overrides,
    }
    set(s => ({ objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  updateQuad: (id, quad) => {
    set(s => ({
      objects: applyAllParameters(
        { ...s.objects, [id]: { ...s.objects[id], quad } },
        s.parameters,
      ),
    }))
  },

  select:  (id) => set({ selectedId: id }),

  deleteSelected: () => {
    const { selectedId, objects, parameters } = get()
    if (!selectedId) return
    const newObjs = { ...objects }
    for (const obj of Object.values(newObjs)) {
      obj.pins = obj.pins.map(p =>
        p.boundToObjectId === selectedId ? { ...p, boundToObjectId: null } : p
      )
    }
    delete newObjs[selectedId]
    // 也從所有參數中移除此物件
    const newParams = { ...parameters }
    for (const [pid, p] of Object.entries(newParams)) {
      newParams[pid] = {
        ...p,
        boundObjectIds: p.boundObjectIds.filter(i => i !== selectedId),
        keyframes:      p.keyframes.map(kf => {
          const q = { ...kf.quads }; delete q[selectedId]; return { ...kf, quads: q }
        }),
      }
    }
    set({ objects: newObjs, parameters: newParams, selectedId: null })
  },

  // ── 重心與插銷 ────────────────────────────────────────────────────
  setPivotUV: (id, uv) => {
    set(s => ({
      objects: applyAllParameters(
        { ...s.objects, [id]: { ...s.objects[id], pivot: { ...s.objects[id].pivot, uv } } },
        s.parameters,
      ),
    }))
  },

  addPin: (id, uv) => {
    const pinId = `pin_${_pinId++}`
    set(s => ({
      objects: {
        ...s.objects,
        [id]: { ...s.objects[id], pins: [...s.objects[id].pins, { id: pinId, name: `插銷 ${_pinId - 1}`, uv, boundToObjectId: null }] },
      },
    }))
    return pinId
  },

  removePin: (id, pinId) => set(s => ({
    objects: { ...s.objects, [id]: { ...s.objects[id], pins: s.objects[id].pins.filter(p => p.id !== pinId) } },
  })),

  bindPin: (objectId, pinId, targetObjectId) => set(s => ({
    objects: applyAllParameters(
      { ...s.objects, [objectId]: { ...s.objects[objectId], pins: s.objects[objectId].pins.map(p => p.id === pinId ? { ...p, boundToObjectId: targetObjectId } : p) } },
      s.parameters,
    ),
  })),

  unbindPin: (objectId, pinId) => set(s => ({
    objects: { ...s.objects, [objectId]: { ...s.objects[objectId], pins: s.objects[objectId].pins.map(p => p.id === pinId ? { ...p, boundToObjectId: null } : p) } },
  })),

  // ── 參數 ──────────────────────────────────────────────────────────
  addParameter: (name, min, max) => {
    const id = `param_${_paramId++}`
    const param: Parameter = { id, name, min, max, value: min, boundObjectIds: [], keyframes: [] }
    set(s => ({ parameters: { ...s.parameters, [id]: param }, selectedParamId: id }))
    return id
  },

  deleteParameter: (paramId) => set(s => {
    const p = { ...s.parameters }; delete p[paramId]
    return { parameters: p, selectedParamId: s.selectedParamId === paramId ? null : s.selectedParamId }
  }),

  setParameterValue: (paramId, value) => {
    set(s => {
      const param = { ...s.parameters[paramId], value }
      const newParams = { ...s.parameters, [paramId]: param }
      return {
        parameters: newParams,
        objects: applyAllParameters(s.objects, newParams),
      }
    })
  },

  selectParameter: (paramId) => set({ selectedParamId: paramId }),

  bindObjectToParam: (paramId, objectId) => set(s => ({
    parameters: {
      ...s.parameters,
      [paramId]: {
        ...s.parameters[paramId],
        boundObjectIds: s.parameters[paramId].boundObjectIds.includes(objectId)
          ? s.parameters[paramId].boundObjectIds
          : [...s.parameters[paramId].boundObjectIds, objectId],
      },
    },
  })),

  unbindObjectFromParam: (paramId, objectId) => set(s => ({
    parameters: {
      ...s.parameters,
      [paramId]: {
        ...s.parameters[paramId],
        boundObjectIds: s.parameters[paramId].boundObjectIds.filter(i => i !== objectId),
      },
    },
  })),

  // 在目前參數值記錄所有綁定物件的當前 quad
  recordKeyframe: (paramId) => {
    const { objects, parameters } = get()
    const param = parameters[paramId]
    if (!param) return
    const t = param.value
    const quads: Record<string, Quad> = {}
    for (const id of param.boundObjectIds) {
      if (objects[id]) quads[id] = objects[id].quad
    }
    // 若此 t 已有關鍵幀則覆蓋，否則新增
    const existing = param.keyframes.findIndex(kf => Math.abs(kf.t - t) < 0.001)
    const newKfs: Keyframe[] = existing >= 0
      ? param.keyframes.map((kf, i) => i === existing ? { t, quads } : kf)
      : [...param.keyframes, { t, quads }].sort((a, b) => a.t - b.t)
    set(s => ({ parameters: { ...s.parameters, [paramId]: { ...param, keyframes: newKfs } } }))
  },

  deleteKeyframe: (paramId, t) => set(s => ({
    parameters: {
      ...s.parameters,
      [paramId]: { ...s.parameters[paramId], keyframes: s.parameters[paramId].keyframes.filter(kf => Math.abs(kf.t - t) > 0.001) },
    },
  })),

  setMode:      (mode) => set({ mode }),
  toggleJoints: ()     => set(s => ({ showJoints: !s.showJoints })),
}))
