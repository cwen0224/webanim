import { useEffect, useRef, useState, useCallback } from 'react'
import { Application } from 'pixi.js'
import { useSceneStore } from './store/sceneStore'
import { StageManager } from './render/StageManager'
import { makeRectQuad } from './core/transform/quad'
import './App.css'

export default function App() {
  const canvasRef  = useRef<HTMLDivElement>(null)
  const managerRef = useRef<StageManager | null>(null)

  const objects           = useSceneStore(s => s.objects)
  const parameters        = useSceneStore(s => s.parameters)
  const selectedId        = useSceneStore(s => s.selectedId)
  const selectedParamId   = useSceneStore(s => s.selectedParamId)
  const selectedVertices  = useSceneStore(s => s.selectedVertices)
  const mode              = useSceneStore(s => s.mode)
  const showJoints        = useSceneStore(s => s.showJoints)
  const addObject         = useSceneStore(s => s.addObject)
  const deleteSelected    = useSceneStore(s => s.deleteSelected)
  const setTexture        = useSceneStore(s => s.setTexture)
  const addDeformer       = useSceneStore(s => s.addDeformer)
  const bindToDeformer    = useSceneStore(s => s.bindToDeformer)
  const unbindFromDeformer= useSceneStore(s => s.unbindFromDeformer)
  const removePin         = useSceneStore(s => s.removePin)
  const unbindPin         = useSceneStore(s => s.unbindPin)
  const setMode           = useSceneStore(s => s.setMode)
  const toggleJoints      = useSceneStore(s => s.toggleJoints)
  const addParameter     = useSceneStore(s => s.addParameter)
  const deleteParameter  = useSceneStore(s => s.deleteParameter)
  const setParameterValue= useSceneStore(s => s.setParameterValue)
  const selectParameter  = useSceneStore(s => s.selectParameter)
  const bindObjectToParam= useSceneStore(s => s.bindObjectToParam)
  const unbindObjFromParam=useSceneStore(s => s.unbindObjectFromParam)
  const recordKeyframe   = useSceneStore(s => s.recordKeyframe)
  const deleteKeyframe   = useSceneStore(s => s.deleteKeyframe)
  const undo             = useSceneStore(s => s.undo)
  const redo             = useSceneStore(s => s.redo)
  const addMask          = useSceneStore(s => s.addMask)
  const removeMask       = useSceneStore(s => s.removeMask)
  const setMaskMode      = useSceneStore(s => s.setMaskMode)
  const storeGet         = useSceneStore.getState

  // 新增參數 dialog 狀態
  const [newParamName, setNewParamName] = useState('')
  const [showNewParam, setShowNewParam] = useState(false)

  // 迷你滑桿位置凍結（拖曳期間固定，放開才移動）
  const [frozenMiniPos, setFrozenMiniPos] = useState<{x:number;y:number} | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const el = canvasRef.current
    const app = new Application()
    let destroyed = false

    app.init({ resizeTo: el, background: '#2a2a2a', antialias: true }).then(() => {
      if (destroyed || !canvasRef.current) return
      el.appendChild(app.canvas)
      const mgr = new StageManager(app, {
        select:             id            => storeGet().select(id),
        selectVertices:     verts         => storeGet().selectVertices(verts),
        setBaseQuad:        (id, q)       => storeGet().setBaseQuad(id, q),
        setBaseQuads:       updates       => storeGet().setBaseQuads(updates),
        autoRecordKeyframe: id            => storeGet().autoRecordKeyframe(id),
        setPivotUV:         (id, uv)      => storeGet().setPivotUV(id, uv),
        addPin:             (id, uv)      => storeGet().addPin(id, uv),
        bindPin:            (oid, pid, tid) => storeGet().bindPin(oid, pid, tid),
        bindToDeformer:     (oid, did)    => storeGet().bindToDeformer(oid, did),
        addMask:            (oid, mid)    => storeGet().addMask(oid, mid),
        setMode:            m             => storeGet().setMode(m),
        pushHistory:        ()            => storeGet().pushHistory(),
      })
      managerRef.current = mgr
    })

    return () => { destroyed = true; managerRef.current = null; app.destroy(true) }
  }, [])

  useEffect(() => {
    managerRef.current?.sync(objects, selectedId, mode, showJoints, selectedVertices)
  }, [objects, selectedId, mode, showJoints, selectedVertices])

  // ── 鍵盤快捷鍵 ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const ctrl = e.ctrlKey || e.metaKey
      const s = storeGet()

      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        s.undo()

      } else if (ctrl && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key === 'y')) {
        e.preventDefault()
        s.redo()

      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.deleteSelected()

      } else if (e.key === 'Escape') {
        managerRef.current?.clearPendingBind()
        managerRef.current?.clearPendingDeformerBind()
        managerRef.current?.clearPendingMaskPick()
        if (s.mode !== 'select') {
          s.setMode('select')
        } else if (s.selectedVertices.length > 0) {
          s.selectVertices([])
        } else {
          s.select(null)
        }

      } else if (ctrl && e.key === 'c') {
        e.preventDefault()
        s.copySelected()

      } else if (ctrl && e.key === 'x') {
        e.preventDefault()
        s.copySelected()
        s.deleteSelected()

      } else if (ctrl && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        s.duplicateSelected()

      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.select(null); s.selectVertices([])

      } else if (ctrl && !e.shiftKey && e.key === 'a') {
        e.preventDefault()
        s.selectAll()

      } else if (e.key === '[') {
        e.preventDefault()
        if (s.selectedId) s.adjustZIndex(s.selectedId, ctrl ? 'back' : 'down')

      } else if (e.key === ']') {
        e.preventDefault()
        if (s.selectedId) s.adjustZIndex(s.selectedId, ctrl ? 'front' : 'up')

      } else if (e.key === 'h' || e.key === 'H') {
        s.toggleJoints()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [storeGet, managerRef, undo, redo])

  // ── 圖片貼入（Ctrl+V / 右鍵） ──────────────────────────────────────
  const handleImagePaste = useCallback(async (blob: Blob, name = 'clipboard.png') => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    try { await img.decode() } catch { URL.revokeObjectURL(url); return }

    // 縮放到最大 400px，保持比例
    const MAX = 400
    const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1)
    const w = Math.round(img.naturalWidth  * scale)
    const h = Math.round(img.naturalHeight * scale)

    let id = storeGet().selectedId
    if (!id) {
      storeGet().addObject()
      id = storeGet().selectedId
    }
    if (!id) return

    const obj = storeGet().objects[id]
    if (!obj) return
    const q  = obj.quad
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
    const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4

    storeGet().setBaseQuad(id, makeRectQuad(cx - w / 2, cy - h / 2, w, h))
    storeGet().setTexture(id, url, name)
  }, [storeGet])

  // Ctrl+V 全域快捷鍵（圖片優先，無圖片則貼上物件）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const items = e.clipboardData?.items
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            const blob = item.getAsFile()
            if (blob) handleImagePaste(blob)
            return
          }
        }
      }
      // 沒有圖片 → 嘗試貼上內部物件剪貼簿
      storeGet().pasteClipboard()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleImagePaste, storeGet])

  const selected     = selectedId       ? objects[selectedId]         : null
  const activeParam  = selectedParamId  ? parameters[selectedParamId] : null

  // 選取物件旁邊的迷你滑桿
  const miniParams = selectedId
    ? Object.values(parameters).filter(p => p.boundObjectIds.includes(selectedId))
    : []

  const _liveMiniPos = (() => {
    if (!selectedId || !objects[selectedId] || miniParams.length === 0) return null
    const q = objects[selectedId].quad
    const xs = q.map(p => p.x), ys = q.map(p => p.y)
    return {
      x: Math.max(...xs) + 14,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    }
  })()
  // 拖曳滑桿時用凍結座標，不隨物件移動；放開後歸位
  const miniPanelPos = frozenMiniPos ?? _liveMiniPos

  const modeLabels: Record<string, string> = {
    select:       selectedVertices.length > 0 ? `選取（已選 ${selectedVertices.length} 頂點）` : '選取',
    editPivot:    '編輯重心 — 拖動橘圈，不會抓角落',
    addPin:       '新增插銷 — 點擊物件放置',
    bind:         '綁定插銷 — 點擊目標物件',
    bindDeformer: '綁定變形器 — 點擊目標變形器',
    pickMask:     '選擇遮罩來源 — 點擊作為遮罩的物件',
  }

  function startBind(pinId: string) {
    if (!selectedId) return
    setMode('bind')
    managerRef.current?.setPendingBind(selectedId, pinId)
  }

  function startBindDeformer() {
    if (!selectedId) return
    setMode('bindDeformer')
    managerRef.current?.setPendingDeformerBind(selectedId)
  }

  function jumpKeyframe(paramId: string, dir: 'prev' | 'next') {
    const param = storeGet().parameters[paramId]
    if (!param) return
    const ts = param.keyframes.map(kf => kf.t).sort((a, b) => a - b)
    if (dir === 'prev') {
      const hit = [...ts].reverse().find(t => t < param.value - 0.001)
      if (hit !== undefined) setParameterValue(paramId, hit)
    } else {
      const hit = ts.find(t => t > param.value + 0.001)
      if (hit !== undefined) setParameterValue(paramId, hit)
    }
  }

  function startPickMask() {
    if (!selectedId) return
    setMode('pickMask')
    managerRef.current?.setPendingMaskPick(selectedId)
  }

  function handleAddParam() {
    const name = newParamName.trim() || `參數 ${Object.keys(parameters).length + 1}`
    addParameter(name, 0, 100)
    setNewParamName('')
    setShowNewParam(false)
  }

  return (
    <div className="app-layout">
      {/* ── 工具列 ── */}
      <header className="toolbar">
        <span className="logo">WebAnim</span>
        <span className="version">Phase 3 — 參數系統</span>
        <span className={`mode-badge ${mode !== 'select' ? 'active' : selectedVertices.length > 0 ? 'active' : ''}`}>
          {modeLabels[mode]}
        </span>
        <button className={`btn-small ${showJoints ? 'on' : ''}`} onClick={toggleJoints}
          title="H — 切換顯示關節">
          {showJoints ? '隱藏關節' : '顯示關節'}
        </button>
      </header>

      <div className="workspace">
        {/* ── 左側：物件 ── */}
        <aside className="panel-left">
          <div className="panel-title">物件</div>
          <button className="btn" onClick={() => addObject()}>+ 新增方塊</button>
          <button className="btn" onClick={() => addDeformer()}>+ 新增變形器</button>
          {selectedId && <button className="btn btn-danger" onClick={deleteSelected}>刪除選取</button>}
          <div className="obj-list">
            {Object.values(objects).map(obj => (
              <div key={obj.id}
                className={`obj-item ${obj.id === selectedId ? 'active' : ''}`}
                onClick={() => storeGet().select(obj.id)}>
                <span className="obj-color" style={{ background: `#${obj.tint.toString(16).padStart(6, '0')}` }} />
                {obj.name}
              </div>
            ))}
          </div>
        </aside>

        <div className="canvas-area" ref={canvasRef}
          onContextMenu={async e => {
            e.preventDefault()
            try {
              const items = await navigator.clipboard.read()
              for (const item of items) {
                const type = item.types.find(t => t.startsWith('image/'))
                if (type) { await handleImagePaste(await item.getType(type)); break }
              }
            } catch { /* 無剪貼簿權限或無圖片 */ }
          }}
        >
          {/* ── 迷你參數滑桿（浮動在物件旁） ── */}
          {miniPanelPos && (mode === 'select' || mode === 'editPivot') && (
            <div
              className="mini-param-overlay"
              style={{ left: miniPanelPos.x, top: miniPanelPos.y }}
            >
              {miniParams.map(param => {
                const atKf = param.keyframes.some(kf => Math.abs(kf.t - param.value) < 0.001)
                return (
                  <div key={param.id} className="mini-param-card">
                    <div className="mini-param-header">
                      <span className="mini-param-name" title={param.name}>{param.name}</span>
                      <span className="mini-param-val">{param.value.toFixed(0)}</span>
                      <button
                        className={`mini-kf-btn ${atKf ? 'lit' : ''}`}
                        title={atKf ? '覆蓋關鍵幀' : '記錄關鍵幀'}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); recordKeyframe(param.id) }}
                      >◎</button>
                    </div>
                    <div className="mini-slider-nav">
                      <button className="kf-nav-btn-mini"
                        title="跳到前一個關鍵幀"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); jumpKeyframe(param.id, 'prev') }}
                        disabled={!param.keyframes.some(kf => kf.t < param.value - 0.001)}
                      >◀</button>
                      <div className="mini-slider-wrap">
                        <input
                          type="range"
                          className="mini-slider"
                          min={param.min} max={param.max} step={0.5}
                          value={param.value}
                          onPointerDown={e => { e.stopPropagation(); setFrozenMiniPos(_liveMiniPos) }}
                          onPointerUp={() => setFrozenMiniPos(null)}
                          onChange={e => setParameterValue(param.id, parseFloat(e.target.value))}
                        />
                        <div className="mini-kf-markers">
                          {param.keyframes.map(kf => {
                            const pct = (kf.t - param.min) / (param.max - param.min)
                            return (
                              <span key={kf.t} className="kf-marker"
                                style={{ left: `calc(${pct.toFixed(4)} * (100% - 12px) + 6px)` }}
                                title={`關鍵幀 t=${kf.t}，點擊刪除`}
                                onClick={e => { e.stopPropagation(); deleteKeyframe(param.id, kf.t) }}
                              />
                            )
                          })}
                        </div>
                      </div>
                      <button className="kf-nav-btn-mini"
                        title="跳到下一個關鍵幀"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); jumpKeyframe(param.id, 'next') }}
                        disabled={!param.keyframes.some(kf => kf.t > param.value + 0.001)}
                      >▶</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 右側：屬性 ── */}
        <aside className="panel-right">
          {selected ? (
            <>
              <div className="panel-title">{selected.name}</div>

              {/* 圖片 */}
              <div className="section-label">圖片</div>
              {selected.textureUrl ? (
                <div className="prop-row">
                  <span className="pin-name" title={selected.textureName ?? ''}>
                    {selected.textureName ?? '已載入'}
                  </span>
                  <button className="btn-inline danger" onClick={() => setTexture(selected.id, null, null)}>移除</button>
                </div>
              ) : (
                <label className="btn" style={{ cursor: 'pointer' }}>
                  選擇圖片…
                  <input type="file" accept="image/*" hidden
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleImagePaste(file, file.name)
                      e.target.value = ''
                    }} />
                </label>
              )}

              {/* 重心 */}
              <div className="section-label">
                重心
                <button
                  className={`btn-inline ${mode === 'editPivot' ? 'warn' : ''}`}
                  onClick={() => setMode(mode === 'editPivot' ? 'select' : 'editPivot')}
                  title="編輯重心模式：只能拖動重心，不會抓到端點">
                  {mode === 'editPivot' ? '完成' : '編輯重心'}
                </button>
              </div>
              <div className="prop-row">
                <span className="pivot-dot" />
                <span className="prop-val">
                  ({selected.pivot.uv.u.toFixed(2)}, {selected.pivot.uv.v.toFixed(2)})
                </span>
                <span className="hint-small">可拖移</span>
              </div>

              {/* 插銷 */}
              <div className="section-label">
                插銷
                <button className="btn-inline" onClick={() => setMode('addPin')}>+ 新增</button>
              </div>
              {selected.pins.length === 0 && <div className="empty-hint">點「+ 新增」後點畫布放置</div>}
              {selected.pins.map(pin => (
                <div key={pin.id} className="pin-row">
                  <span className={`pin-dot ${pin.boundToObjectId ? 'bound' : ''}`} />
                  <span className="pin-name">{pin.name}</span>
                  <div className="pin-actions">
                    {!pin.boundToObjectId
                      ? <button className="btn-inline" onClick={() => startBind(pin.id)}>綁定</button>
                      : <button className="btn-inline warn" onClick={() => unbindPin(selected.id, pin.id)}>解除</button>
                    }
                    <button className="btn-inline danger" onClick={() => removePin(selected.id, pin.id)}>✕</button>
                  </div>
                </div>
              ))}

              {/* 變形器綁定（非變形器才顯示） */}
              {!selected.isDeformer && (
                <>
                  <div className="section-label">變形器</div>
                  {selected.deformerBinding ? (
                    <div className="prop-row">
                      <span className="pin-name">
                        {objects[selected.deformerBinding.deformerId]?.name ?? '（已刪除）'}
                      </span>
                      <button className="btn-inline warn"
                        onClick={() => unbindFromDeformer(selected.id)}>解除綁定</button>
                    </div>
                  ) : (
                    <button className="btn-inline" onClick={startBindDeformer}>綁定變形器…</button>
                  )}
                </>
              )}

              {/* 遮罩 */}
              <div className="section-label">
                遮罩
                <button className="btn-inline" onClick={startPickMask}>+ 選來源</button>
              </div>
              {selected.masks.length === 0 && <div className="empty-hint">點「+ 選來源」後點遮罩物件</div>}
              {selected.masks.map(m => {
                const maskObj = objects[m.maskObjectId]
                return (
                  <div key={m.maskObjectId} className="pin-row">
                    <span className="mask-dot" />
                    <span className="pin-name">{maskObj?.name ?? '（已刪除）'}</span>
                    <div className="pin-actions">
                      <button
                        className={`btn-inline ${m.mode === 'negative' ? 'warn' : ''}`}
                        title="切換遮罩模式：正（PNG輪廓顯示）→ 反（PNG輪廓鏤空）"
                        onClick={() => {
                          const next = m.mode === 'positive' ? 'negative' : 'positive'
                          setMaskMode(selected.id, m.maskObjectId, next)
                        }}
                      >{m.mode === 'positive' ? '正' : '反'}</button>
                      <button className="btn-inline danger"
                        onClick={() => removeMask(selected.id, m.maskObjectId)}>✕</button>
                    </div>
                  </div>
                )
              })}

              {/* 綁定到參數 */}
              {Object.keys(parameters).length > 0 && (
                <>
                  <div className="section-label">綁定參數</div>
                  {Object.values(parameters).map(p => {
                    const bound = p.boundObjectIds.includes(selected.id)
                    return (
                      <div key={p.id} className="pin-row">
                        <span className="param-icon">▷</span>
                        <span className="pin-name">{p.name}</span>
                        <button
                          className={`btn-inline ${bound ? 'warn' : ''}`}
                          onClick={() => bound
                            ? unbindObjFromParam(p.id, selected.id)
                            : bindObjectToParam(p.id, selected.id)}>
                          {bound ? '解除' : '綁定'}
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          ) : (
            <>
              <div className="panel-title">說明</div>
              <div className="hint">• 拖角落 → 梯形變形</div>
              <div className="hint">• 拖橘圈 → 移動重心</div>
              <div className="hint">• 拖中間 → 移動物件</div>
              <div className="hint">• 藍菱形 → 插銷</div>
              <div className="hint">• 滑桿   → 參數插值</div>
              <div className="hint">• Shift+拖 → 套索選頂點</div>
              <div className="hint">• 橙色菱形 → 等比縮放</div>
              <div className="hint">• 黃色圓圈 → 旋轉選取頂點</div>
              <div className="section-label" style={{ marginTop: 8 }}>快捷鍵</div>
              <div className="hint">• Ctrl+Z    → 復原</div>
              <div className="hint">• Ctrl+Y/⇧Z → 重做</div>
              <div className="hint">• Ctrl+C    → 複製物件</div>
              <div className="hint">• Ctrl+X    → 剪下物件</div>
              <div className="hint">• Ctrl+V    → 貼上物件／圖片</div>
              <div className="hint">• Del / ⌫  → 刪除選取</div>
              <div className="hint">• Esc       → 取消 / 清除選取</div>
              <div className="hint">• Ctrl+D    → 複製</div>
              <div className="hint">• Ctrl+A    → 全選頂點</div>
              <div className="hint">• Ctrl+⇧+A → 取消全選</div>
              <div className="hint">• [  /  ]   → 調整圖層順序</div>
              <div className="hint">• Ctrl+[/]  → 移至最底/頂</div>
              <div className="hint">• H         → 顯示 / 隱藏關節</div>
            </>
          )}
        </aside>
      </div>

      {/* ── 底部：參數列 ── */}
      <footer className="param-bar">
        <div className="param-bar-header">
          <span className="param-bar-title">參數</span>
          <button className="btn-small" onClick={() => setShowNewParam(v => !v)}>+ 新增參數</button>
        </div>

        {showNewParam && (
          <div className="new-param-row">
            <input
              className="param-input"
              placeholder="參數名稱（如：頭部左右轉）"
              value={newParamName}
              onChange={e => setNewParamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddParam()}
              autoFocus
            />
            <button className="btn-inline" onClick={handleAddParam}>確定</button>
            <button className="btn-inline danger" onClick={() => setShowNewParam(false)}>取消</button>
          </div>
        )}

        <div className="param-list">
          {Object.values(parameters).map(param => {
            const isActive = param.id === selectedParamId
            const hasKf    = (t: number) => param.keyframes.some(kf => Math.abs(kf.t - t) < 0.001)
            const atKf     = hasKf(param.value)
            return (
              <div key={param.id}
                className={`param-row ${isActive ? 'active' : ''}`}
                onClick={() => selectParameter(isActive ? null : param.id)}>
                <span className="param-name">{param.name}</span>
                <span className="param-val">{param.value.toFixed(0)}</span>
                <div className="slider-nav">
                  <button className="kf-nav-btn"
                    title="跳到前一個關鍵幀"
                    onClick={e => { e.stopPropagation(); jumpKeyframe(param.id, 'prev') }}
                    disabled={!param.keyframes.some(kf => kf.t < param.value - 0.001)}
                  >◀</button>
                  <div className="slider-wrap">
                    <input
                      type="range"
                      className="param-slider"
                      min={param.min} max={param.max} step={0.5}
                      value={param.value}
                      onChange={e => setParameterValue(param.id, parseFloat(e.target.value))}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="param-kf-markers">
                      {param.keyframes.map(kf => {
                        const pct = (kf.t - param.min) / (param.max - param.min)
                        return (
                          <span key={kf.t}
                            className="kf-marker"
                            style={{ left: `calc(${pct.toFixed(4)} * (100% - 16px) + 8px)` }}
                            title={`關鍵幀 t=${kf.t}`}
                            onClick={e => { e.stopPropagation(); deleteKeyframe(param.id, kf.t) }}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <button className="kf-nav-btn"
                    title="跳到下一個關鍵幀"
                    onClick={e => { e.stopPropagation(); jumpKeyframe(param.id, 'next') }}
                    disabled={!param.keyframes.some(kf => kf.t > param.value + 0.001)}
                  >▶</button>
                </div>
                <button
                  className={`btn-inline ${atKf ? 'warn' : ''}`}
                  title={atKf ? '覆蓋關鍵幀' : '記錄關鍵幀'}
                  onClick={e => { e.stopPropagation(); recordKeyframe(param.id) }}>
                  {atKf ? '● 覆蓋' : '◎ 記錄'}
                </button>
                <button className="btn-inline danger"
                  onClick={e => { e.stopPropagation(); deleteParameter(param.id) }}>✕</button>
              </div>
            )
          })}
          {Object.keys(parameters).length === 0 && (
            <span className="empty-hint">尚無參數 — 點「+ 新增參數」建立</span>
          )}
        </div>
      </footer>
    </div>
  )
}
