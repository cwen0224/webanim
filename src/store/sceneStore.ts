import { create } from 'zustand'
import type { SceneObject, Quad, UV, Pin, DeformerBinding, MaskEntry, MaskMode } from '../core/model/types'
import type { Parameter, Keyframe } from '../core/parameter/types'
import { makeRectQuad, worldToUV, uvToWorld } from '../core/transform/quad'
import { applyConstraints } from '../core/constraint/solver'
import { evaluateParameter } from '../core/parameter/interpolation'

export type EditorMode = 'select' | 'editPivot' | 'addPin' | 'bind' | 'bindDeformer' | 'pickMask'

export interface VertexRef { objId: string; cornerIndex: number }

type Snapshot = {
  objects:    Record<string, SceneObject>
  parameters: Record<string, Parameter>
}

interface SceneStore {
  objects:    Record<string, SceneObject>
  parameters: Record<string, Parameter>
  selectedId:       string | null
  selectedParamId:  string | null
  selectedVertices: VertexRef[]
  mode:         EditorMode
  showJoints:   boolean
  history:      Snapshot[]
  future:       Snapshot[]
  clipboardObj: SceneObject | null

  // 物件
  addObject:          (obj?: Partial<SceneObject>) => void
  addDeformer:        () => void
  updateQuad:         (id: string, quad: Quad) => void
  setBaseQuad:        (id: string, quad: Quad) => void
  setBaseQuads:       (updates: Record<string, Quad>) => void
  autoRecordKeyframe: (id: string) => void
  setTexture:         (id: string, url: string | null, name?: string | null) => void
  bindToDeformer:     (objectId: string, deformerId: string) => void
  unbindFromDeformer: (objectId: string) => void
  select:             (id: string | null) => void
  selectVertices:     (verts: VertexRef[]) => void
  copySelected:       () => void
  pasteClipboard:     () => void
  duplicateSelected:  () => void
  selectAll:          () => void
  adjustZIndex:       (id: string, dir: 'up' | 'down' | 'front' | 'back') => void
  deleteSelected:     () => void

  // 重心與插銷
  setPivotUV: (id: string, uv: UV) => void
  addPin:     (id: string, uv: UV) => string
  removePin:  (id: string, pinId: string) => void
  bindPin:    (objectId: string, pinId: string, targetObjectId: string) => void
  unbindPin:  (objectId: string, pinId: string) => void

  // 參數
  addParameter:         (name: string, min: number, max: number) => string
  deleteParameter:      (paramId: string) => void
  renameParameter:      (paramId: string, name: string) => void
  setParameterValue:    (paramId: string, value: number) => void
  selectParameter:      (paramId: string | null) => void
  bindObjectToParam:    (paramId: string, objectId: string) => void
  unbindObjectFromParam:(paramId: string, objectId: string) => void
  recordKeyframe:       (paramId: string) => void
  deleteKeyframe:       (paramId: string, t: number) => void

  // 遮罩
  addMask:    (objectId: string, maskObjectId: string) => void
  removeMask: (objectId: string, maskObjectId: string) => void

  // 歷史
  pushHistory: () => void
  undo:        () => void
  redo:        () => void

  // UI
  setMode:      (mode: EditorMode) => void
  toggleJoints: () => void
}

let _nextId   = 1
let _pinId    = 1
let _paramId  = 1
const COLORS  = [0x4a9eff, 0xff6b6b, 0x6bff6b, 0xffcc4a, 0xcc6bff]

// 套用所有參數插值 + 約束求解
// 先把 baseQuad 從關鍵幀更新，再 sync quad = baseQuad，最後跑 applyConstraints
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
      if (result[id]) result[id] = { ...result[id], baseQuad: quad }
    }
  }

  // 同步 quad = baseQuad，讓 applyConstraints 從正確的起點映射
  for (const id of Object.keys(result)) {
    result[id] = { ...result[id], quad: result[id].baseQuad }
  }

  return applyConstraints(result)
}

// 在 set() callback 內直接打包 history push（避免多次 re-render）
function snap(s: SceneStore): Pick<SceneStore, 'history' | 'future'> {
  return {
    history: [...s.history.slice(-49), { objects: s.objects, parameters: s.parameters }],
    future:  [],
  }
}

// 計算子物件的 baseQuad：把世界座標反算回變形器本地座標
// 讓 applyConstraints 映射後能得到原本的世界座標
function toLocalBase(worldQuad: Quad, deformerQuad: Quad, restQuad: Quad): Quad {
  return worldQuad.map(p =>
    uvToWorld(worldToUV(p, deformerQuad, false), restQuad)
  ) as Quad
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects:          {},
  parameters:       {},
  selectedId:       null,
  selectedParamId:  null,
  selectedVertices: [],
  mode:             'select',
  showJoints:       true,
  history:          [],
  future:           [],
  clipboardObj:     null,

  // ── 物件 ──────────────────────────────────────────────────────────
  addObject: (overrides = {}) => {
    const id  = `obj_${_nextId++}`
    const idx = Object.keys(get().objects).length
    const x   = 80 + (idx % 4) * 50
    const y   = 80 + Math.floor(idx / 4) * 50
    const q   = makeRectQuad(x, y, 160, 120)
    const obj: SceneObject = {
      id, name: `物件 ${idx + 1}`,
      quad:     q,
      baseQuad: q,
      opacity:  1,
      tint:     COLORS[idx % COLORS.length],
      parentId: null, children: [], zIndex: idx,
      pivot:    { uv: { u: 0.5, v: 0.5 }, name: '重心' },
      pins:     [],
      textureUrl:      null,
      textureName:     null,
      isDeformer:      false,
      deformerBinding: null,
      masks:           [],
      ...overrides,
    }
    set(s => ({ ...snap(s), objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  updateQuad: (id, quad) => {
    set(s => ({
      objects: applyAllParameters(
        { ...s.objects, [id]: { ...s.objects[id], quad, baseQuad: quad } },
        s.parameters,
      ),
    }))
  },

  // 拖曳中直接設 baseQuad，只跑約束（不跑參數插值，避免互相蓋掉）
  // 對變形器子物件需反算本地座標，讓 applyConstraints 映射後等於拖曳世界位置
  setBaseQuad: (id, worldQuad) => {
    set(s => {
      const obj = s.objects[id]
      if (!obj) return {}
      let baseQuad: Quad = worldQuad
      if (obj.deformerBinding) {
        const deformer = s.objects[obj.deformerBinding.deformerId]
        if (deformer) {
          baseQuad = toLocalBase(worldQuad, deformer.quad, obj.deformerBinding.deformerRestQuad)
        }
      }
      return {
        objects: applyConstraints({
          ...s.objects,
          [id]: { ...obj, baseQuad, quad: baseQuad },
        }),
      }
    })
  },

  setBaseQuads: (updates) => {
    set(s => {
      const merged = { ...s.objects }
      for (const [id, worldQuad] of Object.entries(updates)) {
        const obj = merged[id]
        if (!obj) continue
        let baseQuad: Quad = worldQuad
        if (obj.deformerBinding) {
          const deformer = merged[obj.deformerBinding.deformerId]
          if (deformer) {
            baseQuad = toLocalBase(worldQuad, deformer.quad, obj.deformerBinding.deformerRestQuad)
          }
        }
        merged[id] = { ...obj, baseQuad, quad: baseQuad }
      }
      return { objects: applyConstraints(merged) }
    })
  },

  // 拖完後，對所有綁定此物件的參數，在目前參數值自動記錄/覆蓋關鍵幀
  // 記錄 baseQuad（本地座標），而非 quad（世界座標）
  autoRecordKeyframe: (id) => {
    const { parameters, objects } = get()
    const boundParams = Object.values(parameters).filter(p => p.boundObjectIds.includes(id))
    if (boundParams.length === 0) return
    set(s => {
      let newParams = { ...s.parameters }
      for (const param of boundParams) {
        const t      = param.value
        const quads: Record<string, Quad> = {}
        for (const oid of param.boundObjectIds) {
          if (s.objects[oid]) quads[oid] = s.objects[oid].baseQuad   // ← baseQuad
        }
        const existing = param.keyframes.findIndex(kf => Math.abs(kf.t - t) < 0.001)
        const newKfs = existing >= 0
          ? param.keyframes.map((kf, i) => i === existing ? { t, quads } : kf)
          : [...param.keyframes, { t, quads }].sort((a, b) => a.t - b.t)
        newParams[param.id] = { ...param, keyframes: newKfs }
      }
      return { parameters: newParams }
    })
  },

  setTexture: (id, url, name = null) => set(s => ({
    ...snap(s),
    objects: { ...s.objects, [id]: { ...s.objects[id], textureUrl: url, textureName: name ?? null } },
  })),

  addDeformer: () => {
    const { objects, selectedId, selectedVertices } = get()
    
    // 收集所有被選取的物件（包含 selectedId，以及透過 lasso 選取的 selectedVertices 所屬的物件）
    const involvedIds = new Set<string>()
    if (selectedId && objects[selectedId] && !objects[selectedId].isDeformer) involvedIds.add(selectedId)
    for (const v of selectedVertices) {
      if (objects[v.objId] && !objects[v.objId].isDeformer) involvedIds.add(v.objId)
    }

    const id  = `obj_${_nextId++}`
    const idx = Object.keys(objects).length
    let q = makeRectQuad(80, 80, 200, 160)

    if (involvedIds.size > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const oid of involvedIds) {
        for (const p of objects[oid].quad) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y
          if (p.y > maxY) maxY = p.y
        }
      }
      const pad = 20
      q = makeRectQuad(
        minX - pad, minY - pad,
        maxX - minX + pad * 2,
        maxY - minY + pad * 2,
      )
    }

    const obj: SceneObject = {
      id, name: `變形器 ${idx + 1}`,
      quad: q, baseQuad: q,
      opacity: 1, tint: 0x44aaff,
      parentId: null, children: [], zIndex: -idx - 1,
      pivot: { uv: { u: 0.5, v: 0.5 }, name: '重心' },
      pins: [], textureUrl: null, textureName: null,
      isDeformer: true, deformerBinding: null, masks: [],
    }

    set(s => {
      let newObjects = { ...s.objects, [id]: obj }
      // 自動綁定所有 involvedIds 到這個新的變形器
      for (const oid of involvedIds) {
        newObjects[oid] = {
          ...newObjects[oid],
          baseQuad: [...newObjects[oid].quad] as Quad,
          deformerBinding: { deformerId: id, deformerRestQuad: [...q] as Quad },
        }
      }
      return { 
        ...snap(s), 
        objects: applyConstraints(newObjects, s.parameters), 
        selectedId: id,
        selectedVertices: [] // clear lasso selection
      }
    })
  },

  bindToDeformer: (objectId, deformerId) => {
    const { objects } = get()
    const obj      = objects[objectId]
    const deformer = objects[deformerId]
    if (!obj || !deformer || !deformer.isDeformer || obj.isDeformer) return
    // 綁定時 baseQuad = 當下世界座標（= 變形器靜止時的本地座標）
    set(s => ({
      ...snap(s),
      objects: applyConstraints({
        ...s.objects,
        [objectId]: {
          ...s.objects[objectId],
          baseQuad: s.objects[objectId].quad,   // 確保 baseQuad = 當下世界座標
          deformerBinding: { deformerId, deformerRestQuad: deformer.quad },
        },
      }),
    }))
  },

  unbindFromDeformer: (objectId) => set(s => ({
    ...snap(s),
    objects: applyConstraints({
      ...s.objects,
      [objectId]: {
        ...s.objects[objectId],
        baseQuad: s.objects[objectId].quad,   // 解綁後用當下世界座標
        deformerBinding: null,
      },
    }),
  })),

  select:         (id)    => set({ selectedId: id }),
  selectVertices: (verts) => set({ selectedVertices: verts }),

  copySelected: () => {
    const { selectedId, objects } = get()
    if (!selectedId || !objects[selectedId]) return
    set({ clipboardObj: objects[selectedId] })
  },

  pasteClipboard: () => {
    const { clipboardObj, objects } = get()
    if (!clipboardObj) return
    const id  = `obj_${_nextId++}`
    const off = 20
    const q   = clipboardObj.quad.map(p => ({ x: p.x + off, y: p.y + off })) as Quad
    const obj: SceneObject = {
      ...clipboardObj, id,
      name:            `${clipboardObj.name} 副本`,
      quad:            q,
      baseQuad:        q,
      pins:            [],
      deformerBinding: null,
      masks:           [],
      zIndex:          Object.values(objects).length,
    }
    set(s => ({ ...snap(s), objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  duplicateSelected: () => {
    const { objects, selectedId } = get()
    if (!selectedId || !objects[selectedId]) return
    const src = objects[selectedId]
    const id  = `obj_${_nextId++}`
    const off = 20
    const q   = src.quad.map(p => ({ x: p.x + off, y: p.y + off })) as Quad
    const obj: SceneObject = {
      ...src, id,
      name:            `${src.name} 副本`,
      quad:            q,
      baseQuad:        q,
      pins:            [],
      deformerBinding: null,
      masks:           [],
      zIndex:          Object.values(objects).length,
    }
    set(s => ({ ...snap(s), objects: { ...s.objects, [id]: obj }, selectedId: id }))
  },

  selectAll: () => {
    const { objects } = get()
    const verts: VertexRef[] = []
    for (const objId of Object.keys(objects))
      for (let i = 0; i < 4; i++) verts.push({ objId, cornerIndex: i })
    set({ selectedVertices: verts })
  },

  adjustZIndex: (id, dir) => {
    const { objects } = get()
    const sorted = Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
    const idx = sorted.findIndex(o => o.id === id)
    if (idx === -1) return
    const swapIdx =
      dir === 'up'    ? Math.min(idx + 1, sorted.length - 1) :
      dir === 'down'  ? Math.max(idx - 1, 0) :
      dir === 'front' ? sorted.length - 1 : 0
    if (swapIdx === idx) return
    const a = sorted[idx], b = sorted[swapIdx]
    set(s => ({
      ...snap(s),
      objects: {
        ...s.objects,
        [a.id]: { ...s.objects[a.id], zIndex: b.zIndex },
        [b.id]: { ...s.objects[b.id], zIndex: a.zIndex },
      },
    }))
  },

  deleteSelected: () => {
    const { selectedId, objects, parameters } = get()
    if (!selectedId) return
    const newObjs: Record<string, SceneObject> = {}
    for (const [id, obj] of Object.entries(objects)) {
      if (id === selectedId) continue
      newObjs[id] = {
        ...obj,
        pins: obj.pins.map(p =>
          p.boundToObjectId === selectedId ? { ...p, boundToObjectId: null } : p
        ),
        deformerBinding: obj.deformerBinding?.deformerId === selectedId
          ? null : obj.deformerBinding,
      }
    }
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
    set(s => ({ ...snap(s), objects: newObjs, parameters: newParams, selectedId: null }))
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
      ...snap(s),
      objects: {
        ...s.objects,
        [id]: { ...s.objects[id], pins: [...s.objects[id].pins, { id: pinId, name: `插銷 ${_pinId - 1}`, uv, boundToObjectId: null }] },
      },
    }))
    return pinId
  },

  removePin: (id, pinId) => set(s => ({
    ...snap(s),
    objects: { ...s.objects, [id]: { ...s.objects[id], pins: s.objects[id].pins.filter(p => p.id !== pinId) } },
  })),

  bindPin: (objectId, pinId, targetObjectId) => set(s => ({
    ...snap(s),
    objects: applyAllParameters(
      { ...s.objects, [objectId]: { ...s.objects[objectId], pins: s.objects[objectId].pins.map(p => p.id === pinId ? { ...p, boundToObjectId: targetObjectId } : p) } },
      s.parameters,
    ),
  })),

  unbindPin: (objectId, pinId) => set(s => ({
    ...snap(s),
    objects: { ...s.objects, [objectId]: { ...s.objects[objectId], pins: s.objects[objectId].pins.map(p => p.id === pinId ? { ...p, boundToObjectId: null } : p) } },
  })),

  // ── 參數 ──────────────────────────────────────────────────────────
  addParameter: (name, min, max) => {
    const id = `param_${_paramId++}`
    const param: Parameter = { id, name, min, max, value: min, boundObjectIds: [], keyframes: [] }
    set(s => ({ ...snap(s), parameters: { ...s.parameters, [id]: param }, selectedParamId: id }))
    return id
  },

  deleteParameter: (paramId) => set(s => {
    const p = { ...s.parameters }; delete p[paramId]
    return {
      ...snap(s),
      parameters: p,
      selectedParamId: s.selectedParamId === paramId ? null : s.selectedParamId,
    }
  }),

  renameParameter: (paramId, name) => set(s => {
    const p = s.parameters[paramId]
    if (!p) return s
    return { ...s, parameters: { ...s.parameters, [paramId]: { ...p, name } } }
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

  bindObjectToParam: (paramId, objectId) => set(s => {
    const param = s.parameters[paramId]
    if (!param) return snap(s)
    if (param.boundObjectIds.includes(objectId)) return snap(s)

    const obj = s.objects[objectId]
    if (!obj) return snap(s)

    // 自動在 min 和 max 建立/更新關鍵幀
    let newKfs = [...param.keyframes]
    const ensureKf = (t: number) => {
      const idx = newKfs.findIndex(kf => Math.abs(kf.t - t) < 0.001)
      if (idx >= 0) {
        newKfs[idx] = { ...newKfs[idx], quads: { ...newKfs[idx].quads, [objectId]: obj.baseQuad } }
      } else {
        newKfs.push({ t, quads: { [objectId]: obj.baseQuad } })
      }
    }
    ensureKf(param.min)
    ensureKf(param.max)
    newKfs.sort((a, b) => a.t - b.t)

    return {
      ...snap(s),
      parameters: {
        ...s.parameters,
        [paramId]: {
          ...param,
          boundObjectIds: [...param.boundObjectIds, objectId],
          keyframes: newKfs
        },
      },
    }
  }),

  unbindObjectFromParam: (paramId, objectId) => set(s => {
    const param = s.parameters[paramId]
    if (!param) return snap(s)

    // 移除該物件在所有關鍵幀中的資料
    const newKfs = param.keyframes.map(kf => {
      const q = { ...kf.quads }
      delete q[objectId]
      return { ...kf, quads: q }
    })

    return {
      ...snap(s),
      parameters: {
        ...s.parameters,
        [paramId]: {
          ...param,
          boundObjectIds: param.boundObjectIds.filter(i => i !== objectId),
          keyframes: newKfs
        },
      },
    }
  }),

  recordKeyframe: (paramId) => {
    const { objects, parameters } = get()
    const param = parameters[paramId]
    if (!param) return
    const t = param.value
    const quads: Record<string, Quad> = {}
    for (const id of param.boundObjectIds) {
      if (objects[id]) quads[id] = objects[id].baseQuad   // ← baseQuad
    }
    const existing = param.keyframes.findIndex(kf => Math.abs(kf.t - t) < 0.001)
    const newKfs: Keyframe[] = existing >= 0
      ? param.keyframes.map((kf, i) => i === existing ? { t, quads: { ...kf.quads, ...quads } } : kf)
      : [...param.keyframes, { t, quads }].sort((a, b) => a.t - b.t)
    set(s => ({ ...snap(s), parameters: { ...s.parameters, [paramId]: { ...param, keyframes: newKfs } } }))
  },

  deleteKeyframe: (paramId, t) => set(s => ({
    ...snap(s),
    parameters: {
      ...s.parameters,
      [paramId]: { ...s.parameters[paramId], keyframes: s.parameters[paramId].keyframes.filter(kf => Math.abs(kf.t - t) > 0.001) },
    },
  })),

  // ── 遮罩 ──────────────────────────────────────────────────────────
  addMask: (objectId, maskObjectId) => {
    const { objects } = get()
    const obj = objects[objectId]
    if (!obj) return
    if (obj.masks.some(m => m.maskObjectId === maskObjectId)) return  // 已存在
    set(s => ({
      ...snap(s),
      objects: { ...s.objects, [objectId]: { ...s.objects[objectId], masks: [...s.objects[objectId].masks, { maskObjectId, mode: 'positive' as const }] } },
    }))
  },

  removeMask: (objectId: string, maskObjectId: string) => set(s => ({
    ...snap(s),
    objects: { ...s.objects, [objectId]: { ...s.objects[objectId], masks: s.objects[objectId].masks.filter(m => m.maskObjectId !== maskObjectId) } },
  })),

  // ── 歷史 ──────────────────────────────────────────────────────────
  pushHistory: () => set(s => ({
    history: [...s.history.slice(-49), { objects: s.objects, parameters: s.parameters }],
    future:  [],
  })),

  undo: () => {
    const { history } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set(s => ({
      history:    s.history.slice(0, -1),
      future:     [{ objects: s.objects, parameters: s.parameters }, ...s.future.slice(0, 49)],
      objects:    prev.objects,
      parameters: prev.parameters,
    }))
  },

  redo: () => {
    const { future } = get()
    if (future.length === 0) return
    const next = future[0]
    set(s => ({
      future:     s.future.slice(1),
      history:    [...s.history.slice(-49), { objects: s.objects, parameters: s.parameters }],
      objects:    next.objects,
      parameters: next.parameters,
    }))
  },

  setMode:      (mode) => set({ mode }),
  toggleJoints: ()     => set(s => ({ showJoints: !s.showJoints })),
}))
