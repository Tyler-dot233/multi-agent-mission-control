import { useEffect, useRef, useState } from 'react'
import { Activity, BellRing, Lock, Maximize2, Pin, Scaling, Settings2, Unlock, X } from 'lucide-react'
import type { AgentGroup } from '@/types'
import './mini-widget.css'

const SCALE_KEY = 'aimon.mini.window-scale.v1'
const LOCK_KEY = 'aimon.mini.position-locked.v1'
const RING_LENGTH = 2 * Math.PI * 24

function loadScale() {
  const value = Number(localStorage.getItem(SCALE_KEY) ?? 1)
  return Number.isFinite(value) ? Math.max(0.75, Math.min(1.5, value)) : 1
}

function shortName(name: string) {
  return name.split(' / ')[0]
}

export function MiniWidget({
  groups,
  connected,
  totalCpu,
  totalMem,
  alertCount,
}: {
  groups: AgentGroup[]
  connected: boolean
  totalCpu: number | null
  totalMem: number
  alertCount: number
}) {
  const [scale, setScale] = useState(loadScale)
  const [onTop, setOnTop] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [positionLocked, setPositionLocked] = useState(() => localStorage.getItem(LOCK_KEY) === 'true')
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const processCount = groups.reduce((sum, group) => sum + group.processes.length, 0)
  const visibleGroups = [...groups].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, 4)
  const load = Math.max(0, Math.min(100, totalCpu ?? 0))

  useEffect(() => {
    document.body.classList.add('mini-mode')
    return () => document.body.classList.remove('mini-mode')
  }, [])

  useEffect(() => {
    localStorage.setItem(SCALE_KEY, String(scale))
    if (window.aimonDesktop) void window.aimonDesktop.setMiniScale(scale)
  }, [scale])

  useEffect(() => {
    if (window.aimonDesktop) void window.aimonDesktop.setMiniAgentCount(visibleGroups.length)
  }, [visibleGroups.length])

  useEffect(() => {
    localStorage.setItem(LOCK_KEY, String(positionLocked))
  }, [positionLocked])

  useEffect(() => {
    if (!settingsOpen) return
    const panel = settingsPanelRef.current
    const focusFrame = requestAnimationFrame(() => panel?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSettingsOpen(false)
      settingsButtonRef.current?.focus({ preventScroll: true })
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel?.contains(target) && !settingsButtonRef.current?.contains(target)) setSettingsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [settingsOpen])

  const expand = (tab?: string) => {
    if (window.aimonDesktop) {
      void window.aimonDesktop.expandMain(tab)
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('mini')
    if (tab) url.searchParams.set('tab', tab)
    else url.searchParams.delete('tab')
    window.location.assign(url)
  }

  return (
    <main className="mini-viewport" data-testid="mini-widget">
      <section className={`mini-shell ${connected ? '' : 'is-offline'} ${positionLocked ? 'is-position-locked' : ''}`} aria-label="多智能体迷你悬浮窗">
        <div className="mini-drag-region" aria-hidden />
        <div className="mini-core-zone">
          <div className="mini-orbit mini-orbit-a"><i /><i /></div>
          <div className="mini-orbit mini-orbit-b"><i /><i /></div>
          <div className="mini-core-aura" />
          <div className="mini-core" style={{ background: `conic-gradient(from 20deg, hsl(174 100% 70%) ${load * 2.4}deg, hsl(184 85% 35% / 0.28) ${load * 2.4}deg 280deg, hsl(174 100% 70%) 340deg)` }}>
            <div className="mini-core-surface">
              <span className="font-data">{totalCpu == null ? '—' : Math.round(totalCpu)}<small>%</small></span>
              <em>TOTAL LOAD</em>
            </div>
          </div>
        </div>

        <div className="mini-content">
          <header className="mini-header">
            <div>
              <div className="mini-kicker"><Activity className="h-3 w-3" /> AI PROCESS <span className={connected ? 'online' : 'offline'}>{connected ? 'LIVE' : 'OFFLINE'}</span></div>
              <h1>Multi-Agent Network</h1>
            </div>
            <div className="mini-actions">
              <button className={`mini-icon-button ${alertCount ? 'has-alert' : ''}`} onClick={() => expand('alerts')} aria-label={`打开告警中心，${alertCount} 个活动告警`} title="告警中心">
                <BellRing />{alertCount > 0 && <span>{alertCount}</span>}
              </button>
              <button className={`mini-icon-button ${positionLocked ? 'is-active' : ''}`} onClick={() => setPositionLocked((locked) => !locked)} aria-label={positionLocked ? '解除桌面位置锁定' : '固定到桌面'} aria-pressed={positionLocked} title={positionLocked ? '解除位置锁定' : '固定到桌面，防止误拖动'}>
                {positionLocked ? <Lock /> : <Unlock />}
              </button>
              <button className={`mini-icon-button ${onTop ? 'is-active' : ''}`} onClick={() => {
                const next = !onTop
                setOnTop(next)
                if (window.aimonDesktop) void window.aimonDesktop.setMiniAlwaysOnTop(next)
              }} aria-label={onTop ? '取消置顶' : '设为置顶'} aria-pressed={onTop} title="置顶开关"><Pin /></button>
              <button ref={settingsButtonRef} className={`mini-icon-button ${settingsOpen ? 'is-active' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label="悬浮窗显示设置" aria-expanded={settingsOpen} aria-controls="mini-display-settings" title="悬浮窗显示设置"><Settings2 /></button>
              <button className="mini-icon-button" onClick={() => expand()} aria-label="展开主监控台" title="展开主监控台"><Maximize2 /></button>
              <button className="mini-icon-button" onClick={() => window.aimonDesktop ? void window.aimonDesktop.closeMini() : expand()} aria-label="关闭悬浮窗" title="关闭悬浮窗"><X /></button>
            </div>
          </header>

          <div ref={settingsPanelRef} id="mini-display-settings" className={`mini-settings ${settingsOpen ? 'is-open' : ''}`} role="region" aria-label="悬浮窗显示设置面板" aria-hidden={!settingsOpen} inert={!settingsOpen}>
            <div className="mini-settings-heading">
              <span><Scaling /> 显示缩放</span>
              <output className="font-data" aria-live="polite">{Math.round(scale * 100)}%</output>
            </div>
            <label className="mini-scale" title="悬浮窗整体缩放：75%–150%，每次微调 1%">
              <span>1% 微调</span>
              <input aria-label="悬浮窗缩放" type="range" min="0.75" max="1.5" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
              <span className="mini-scale-range font-data">75—150</span>
            </label>
          </div>

          <div className="mini-agents" aria-hidden={settingsOpen}>
            {visibleGroups.length === 0 ? <div className="mini-empty">正在扫描本机智能体…</div> : visibleGroups.map((group) => {
              const cpu = group.cpu == null ? null : Math.max(0, Math.min(100, group.cpu))
              return (
                <div className="mini-agent" key={group.agentId} title={`${group.name} · ${group.processes.length} 个进程`}>
                  <span className="mini-agent-name">{shortName(group.name)}</span>
                  <div className="mini-agent-ring">
                    <svg viewBox="0 0 58 58" aria-hidden>
                      <circle className="mini-ring-track" cx="29" cy="29" r="24" />
                      <circle className="mini-ring-value" cx="29" cy="29" r="24" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - (cpu ?? 0) / 100)} />
                    </svg>
                    <strong className="font-data">{cpu == null ? '—' : `${Math.round(cpu)}%`}</strong>
                  </div>
                </div>
              )
            })}
          </div>

          <footer className="mini-footer">
            <div className="mini-telemetry font-data"><span>{groups.length} AGENTS</span><i /><span>{processCount} PROCESSES</span><i /><span>{totalMem >= 1024 ? `${(totalMem / 1024).toFixed(2)} GB` : `${totalMem} MB`}</span></div>
            <span className="mini-scale-summary font-data"><Scaling /> {Math.round(scale * 100)}%</span>
          </footer>
        </div>
      </section>
    </main>
  )
}
