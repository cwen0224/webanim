import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import './App.css'

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const app = new Application()
    let destroyed = false

    app.init({
      width: canvasRef.current.clientWidth,
      height: canvasRef.current.clientHeight,
      background: '#2a2a2a',
      antialias: true,
    }).then(() => {
      if (destroyed || !canvasRef.current) return
      canvasRef.current.appendChild(app.canvas)

      // Phase 1 測試：畫一個四邊形確認 PixiJS 正常
      const g = new Graphics()
      g.rect(100, 100, 200, 150).fill({ color: 0x4a9eff, alpha: 0.8 })
      g.rect(100, 100, 200, 150).stroke({ color: 0xffffff, width: 2 })
      app.stage.addChild(g)

      const label = new Graphics()
      label.rect(95, 265, 210, 24).fill({ color: 0x000000, alpha: 0.5 })
      app.stage.addChild(label)
    })

    return () => {
      destroyed = true
      app.destroy(true)
    }
  }, [])

  return (
    <div className="app-layout">
      <header className="toolbar">
        <span className="logo">WebAnim</span>
        <span className="version">v0.1 — Phase 1</span>
      </header>
      <div className="workspace">
        <aside className="panel-left">物件列表</aside>
        <div className="canvas-area" ref={canvasRef} />
        <aside className="panel-right">參數</aside>
      </div>
      <footer className="timeline">時間軸</footer>
    </div>
  )
}
