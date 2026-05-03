import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useSceneStore } from './store/sceneStore'
import { StageManager } from './render/StageManager'
import './App.css'

export default function App() {
  const canvasRef  = useRef<HTMLDivElement>(null)
  const managerRef = useRef<StageManager | null>(null)

  const objects    = useSceneStore(s => s.objects)
  const selectedId = useSceneStore(s => s.selectedId)
  const addObject  = useSceneStore(s => s.addObject)
  const deleteSelected = useSceneStore(s => s.deleteSelected)
  const store      = useSceneStore.getState

  // 初始化 PixiJS
  useEffect(() => {
    if (!canvasRef.current) return
    const el = canvasRef.current
    const app = new Application()
    let alive = true

    app.init({
      width: el.clientWidth || 800,
      height: el.clientHeight || 600,
      background: '#2a2a2a',
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!alive) return
      el.appendChild(app.canvas)

      const mgr = new StageManager(app, {
        select: (id) => useSceneStore.getState().select(id),
        updateQuad: (id, quad) => useSceneStore.getState().updateQuad(id, quad),
      })
      managerRef.current = mgr
    })

    return () => {
      alive = false
      managerRef.current = null
      app.destroy(true)
    }
  }, [])

  // 每次 store 變動就同步到 PixiJS
  useEffect(() => {
    managerRef.current?.sync(objects, selectedId)
  }, [objects, selectedId])

  const selectedName = selectedId ? objects[selectedId]?.name : null

  return (
    <div className="app-layout">
      <header className="toolbar">
        <span className="logo">WebAnim</span>
        <span className="version">Phase 1 — 梯形變形</span>
        {selectedName && (
          <span className="selected-label">選取：{selectedName}</span>
        )}
      </header>

      <div className="workspace">
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
                onClick={() => store().select(obj.id)}
              >
                <span
                  className="obj-color"
                  style={{ background: `#${obj.tint.toString(16).padStart(6, '0')}` }}
                />
                {obj.name}
              </div>
            ))}
          </div>
        </aside>

        <div className="canvas-area" ref={canvasRef} />

        <aside className="panel-right">
          <div className="panel-title">說明</div>
          <div className="hint">• 點擊物件選取</div>
          <div className="hint">• 拖拉角落變形</div>
          <div className="hint">• 拖拉中間移動</div>
          <div className="hint">• 點擊空白取消選取</div>
        </aside>
      </div>

      <footer className="timeline">時間軸（Phase 4）</footer>
    </div>
  )
}
