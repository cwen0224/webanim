import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useSceneStore } from './store/sceneStore'
import { StageManager } from './render/StageManager'
import './App.css'

export default function App() {
  const canvasRef  = useRef<HTMLDivElement>(null)
  const managerRef = useRef<StageManager | null>(null)

  const objects        = useSceneStore(s => s.objects)
  const selectedId     = useSceneStore(s => s.selectedId)
  const mode           = useSceneStore(s => s.mode)
  const showJoints     = useSceneStore(s => s.showJoints)
  const addObject      = useSceneStore(s => s.addObject)
  const deleteSelected = useSceneStore(s => s.deleteSelected)
  const removePin      = useSceneStore(s => s.removePin)
  const unbindPin      = useSceneStore(s => s.unbindPin)
  const setMode        = useSceneStore(s => s.setMode)
  const toggleJoints   = useSceneStore(s => s.toggleJoints)
  const storeGet       = useSceneStore.getState

  useEffect(() => {
    if (!canvasRef.current) return
    const el = canvasRef.current
    const app = new Application()
    let destroyed = false

    app.init({ resizeTo: el, background: '#2a2a2a', antialias: true }).then(() => {
      if (destroyed || !canvasRef.current) return
      el.appendChild(app.canvas)

      const mgr = new StageManager(app, {
        select:     (id) => storeGet().select(id),
        updateQuad: (id, quad) => storeGet().updateQuad(id, quad),
        setPivotUV: (id, uv)  => storeGet().setPivotUV(id, uv),
        addPin:     (id, uv)  => storeGet().addPin(id, uv),
        bindPin:    (oid, pid, tid) => storeGet().bindPin(oid, pid, tid),
        setMode:    (m) => storeGet().setMode(m),
      })
      managerRef.current = mgr
    })

    return () => {
      destroyed = true
      managerRef.current = null
      app.destroy(true)
    }
  }, [])

  useEffect(() => {
    managerRef.current?.sync(objects, selectedId, mode, showJoints)
  }, [objects, selectedId, mode, showJoints])

  const selected     = selectedId ? objects[selectedId] : null
  const modeLabels: Record<string, string> = {
    select: '選取',
    addPin: '新增插銷（點擊物件放置）',
    bind:   '綁定（點擊目標物件重心）',
  }

  function startBind(pinId: string) {
    if (!selectedId) return
    setMode('bind')
    managerRef.current?.setPendingBind(selectedId, pinId)
  }

  return (
    <div className="app-layout">
      <header className="toolbar">
        <span className="logo">WebAnim</span>
        <span className="version">Phase 2 — 重心插銷</span>
        <span className={`mode-badge ${mode !== 'select' ? 'active' : ''}`}>
          {modeLabels[mode]}
        </span>
        <button className={`btn-small ${showJoints ? 'on' : ''}`} onClick={toggleJoints}>
          {showJoints ? '隱藏關節' : '顯示關節'}
        </button>
      </header>

      <div className="workspace">
        {/* 左側：物件列表 */}
        <aside className="panel-left">
          <div className="panel-title">物件</div>
          <button className="btn" onClick={() => addObject()}>+ 新增方塊</button>
          {selectedId && (
            <button className="btn btn-danger" onClick={deleteSelected}>刪除選取</button>
          )}
          <div className="obj-list">
            {Object.values(objects).map(obj => (
              <div
                key={obj.id}
                className={`obj-item ${obj.id === selectedId ? 'active' : ''}`}
                onClick={() => storeGet().select(obj.id)}
              >
                <span className="obj-color"
                  style={{ background: `#${obj.tint.toString(16).padStart(6, '0')}` }} />
                {obj.name}
              </div>
            ))}
          </div>
        </aside>

        <div className="canvas-area" ref={canvasRef} />

        {/* 右側：選取物件的屬性 */}
        <aside className="panel-right">
          {selected ? (
            <>
              <div className="panel-title">{selected.name}</div>

              <div className="section-label">重心</div>
              <div className="prop-row">
                <span className="pivot-dot" />
                <span className="prop-val">
                  ({selected.pivot.uv.u.toFixed(2)}, {selected.pivot.uv.v.toFixed(2)})
                </span>
                <span className="hint-small">可拖移</span>
              </div>

              <div className="section-label">
                插銷
                <button className="btn-inline" onClick={() => setMode('addPin')}>
                  + 新增
                </button>
              </div>

              {selected.pins.length === 0 && (
                <div className="empty-hint">點「+ 新增」後點畫布放置</div>
              )}

              {selected.pins.map(pin => (
                <div key={pin.id} className="pin-row">
                  <span className={`pin-dot ${pin.boundToObjectId ? 'bound' : ''}`} />
                  <span className="pin-name">{pin.name}</span>
                  <div className="pin-actions">
                    {!pin.boundToObjectId ? (
                      <button className="btn-inline" onClick={() => startBind(pin.id)}>
                        綁定
                      </button>
                    ) : (
                      <button className="btn-inline warn"
                        onClick={() => unbindPin(selected.id, pin.id)}>
                        解除
                      </button>
                    )}
                    <button className="btn-inline danger"
                      onClick={() => removePin(selected.id, pin.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="panel-title">說明</div>
              <div className="hint">• 拖角落  → 梯形變形</div>
              <div className="hint">• 拖橘圈  → 移動重心</div>
              <div className="hint">• 拖中間  → 移動物件</div>
              <div className="hint">• 藍菱形  → 插銷（關節點）</div>
              <div className="hint">• 綁定後父件移動，子件跟著走</div>
            </>
          )}
        </aside>
      </div>

      <footer className="timeline">時間軸（Phase 4）</footer>
    </div>
  )
}
