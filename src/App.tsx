import { useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { useSceneStore } from './store/sceneStore'
import { StageManager } from './render/StageManager'
import './App.css'

export default function App() {
  const canvasRef  = useRef<HTMLDivElement>(null)
  const managerRef = useRef<StageManager | null>(null)

  const objects          = useSceneStore(s => s.objects)
  const parameters       = useSceneStore(s => s.parameters)
  const selectedId       = useSceneStore(s => s.selectedId)
  const selectedParamId  = useSceneStore(s => s.selectedParamId)
  const mode             = useSceneStore(s => s.mode)
  const showJoints       = useSceneStore(s => s.showJoints)
  const addObject        = useSceneStore(s => s.addObject)
  const deleteSelected   = useSceneStore(s => s.deleteSelected)
  const removePin        = useSceneStore(s => s.removePin)
  const unbindPin        = useSceneStore(s => s.unbindPin)
  const setMode          = useSceneStore(s => s.setMode)
  const toggleJoints     = useSceneStore(s => s.toggleJoints)
  const addParameter     = useSceneStore(s => s.addParameter)
  const deleteParameter  = useSceneStore(s => s.deleteParameter)
  const setParameterValue= useSceneStore(s => s.setParameterValue)
  const selectParameter  = useSceneStore(s => s.selectParameter)
  const bindObjectToParam= useSceneStore(s => s.bindObjectToParam)
  const unbindObjFromParam=useSceneStore(s => s.unbindObjectFromParam)
  const recordKeyframe   = useSceneStore(s => s.recordKeyframe)
  const deleteKeyframe   = useSceneStore(s => s.deleteKeyframe)
  const storeGet         = useSceneStore.getState

  // 新增參數 dialog 狀態
  const [newParamName, setNewParamName] = useState('')
  const [showNewParam, setShowNewParam] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const el = canvasRef.current
    const app = new Application()
    let destroyed = false

    app.init({ resizeTo: el, background: '#2a2a2a', antialias: true }).then(() => {
      if (destroyed || !canvasRef.current) return
      el.appendChild(app.canvas)
      const mgr = new StageManager(app, {
        select:     id  => storeGet().select(id),
        updateQuad: (id, q) => storeGet().updateQuad(id, q),
        setPivotUV: (id, uv) => storeGet().setPivotUV(id, uv),
        addPin:     (id, uv) => storeGet().addPin(id, uv),
        bindPin:    (oid, pid, tid) => storeGet().bindPin(oid, pid, tid),
        setMode:    m => storeGet().setMode(m),
      })
      managerRef.current = mgr
    })

    return () => { destroyed = true; managerRef.current = null; app.destroy(true) }
  }, [])

  useEffect(() => {
    managerRef.current?.sync(objects, selectedId, mode, showJoints)
  }, [objects, selectedId, mode, showJoints])

  const selected     = selectedId       ? objects[selectedId]         : null
  const activeParam  = selectedParamId  ? parameters[selectedParamId] : null

  const modeLabels: Record<string, string> = {
    select: '選取',
    addPin: '新增插銷 — 點擊物件放置',
    bind:   '綁定 — 點擊目標物件',
  }

  function startBind(pinId: string) {
    if (!selectedId) return
    setMode('bind')
    managerRef.current?.setPendingBind(selectedId, pinId)
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
        <span className={`mode-badge ${mode !== 'select' ? 'active' : ''}`}>
          {modeLabels[mode]}
        </span>
        <button className={`btn-small ${showJoints ? 'on' : ''}`} onClick={toggleJoints}>
          {showJoints ? '隱藏關節' : '顯示關節'}
        </button>
      </header>

      <div className="workspace">
        {/* ── 左側：物件 ── */}
        <aside className="panel-left">
          <div className="panel-title">物件</div>
          <button className="btn" onClick={() => addObject()}>+ 新增方塊</button>
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

        <div className="canvas-area" ref={canvasRef} />

        {/* ── 右側：屬性 ── */}
        <aside className="panel-right">
          {selected ? (
            <>
              <div className="panel-title">{selected.name}</div>

              {/* 重心 */}
              <div className="section-label">重心</div>
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
                <input
                  type="range"
                  className="param-slider"
                  min={param.min} max={param.max} step={0.5}
                  value={param.value}
                  onChange={e => setParameterValue(param.id, parseFloat(e.target.value))}
                  onClick={e => e.stopPropagation()}
                />
                <div className="param-kf-markers">
                  {param.keyframes.map(kf => (
                    <span key={kf.t}
                      className="kf-marker"
                      style={{ left: `${((kf.t - param.min) / (param.max - param.min)) * 100}%` }}
                      title={`關鍵幀 t=${kf.t}`}
                      onClick={e => { e.stopPropagation(); deleteKeyframe(param.id, kf.t) }}
                    />
                  ))}
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
