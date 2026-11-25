import { Maximize, LayoutGrid, ShieldQuestion, Radio, Workflow, BellRing, PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FlowField3D } from '@/sections/FlowField3D'
import { PageSettings } from '@/sections/PageSettings'
import type { RenderQuality } from '@/lib/renderQuality'
import type { AgentGroup, MonitorEvent, Policy, ScanResult } from '@/types'

/**
 * 大屏作战模式：3D 星环全屏铺开，四角 HUD 数据面板直接浮在场景上。
 */
export function Presentation({
  scan,
  connected,
  groups,
  policies,
  pending,
  events,
  alertCount,
  orbitSpeed,
  onOrbitSpeedChange,
  fontSize,
  onFontSizeChange,
  renderQuality,
  onRenderQualityChange,
  onOpenTab,
  onOpenMini,
  onExit,
  onQuickApprove,
}: {
  scan: ScanResult | null
  connected: boolean
  groups: AgentGroup[]
  policies: Record<string, Policy>
  pending: AgentGroup[]
  events: MonitorEvent[]
  alertCount: number
  orbitSpeed: number
  onOrbitSpeedChange: (value: number) => void
  fontSize: number
  onFontSizeChange: (value: number) => void
  renderQuality: RenderQuality
  onRenderQualityChange: (value: RenderQuality) => void
  onOpenTab: (tab: 'overview' | 'tasks' | 'alerts' | 'approvals' | 'events') => void
  onOpenMini: () => void
  onExit: () => void
  onQuickApprove: (g: AgentGroup) => void
}) {
  const totalCpu = groups.reduce((s, g) => s + (g.cpu ?? 0), 0)
  const totalMem = groups.reduce((s, g) => s + g.memMB, 0)

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      {/* 3D 场景铺满 */}
      <div className="absolute inset-0">
        <FlowField3D groups={groups} policies={policies} orbitSpeed={orbitSpeed} quality={renderQuality} />
      </div>

      {/* 顶部 HUD 条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-4 px-5 py-3">
        <Radio className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="neon-text whitespace-nowrap text-sm font-bold tracking-[0.25em] text-primary">多智能体监控台</span>
        <span className="hidden whitespace-nowrap text-[10px] tracking-widest text-muted-foreground xl:inline">MULTI-AGENT MISSION CONTROL</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className={`live-dot inline-block h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-[hsl(152_70%_45%)]' : 'bg-[hsl(0_75%_55%)]'}`} />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{connected ? '已连接' : '未连接'}</span>
          <span className="font-data ml-2 hidden whitespace-nowrap text-xs text-muted-foreground md:inline">{scan?.platform === 'darwin' ? 'macOS' : scan?.platform === 'win32' ? 'Windows' : '—'}</span>
          <div className="pointer-events-auto ml-3 flex gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer border-primary/30 bg-background/50 text-xs backdrop-blur" onClick={() => onOpenTab('tasks')}>
              <Workflow className="h-3.5 w-3.5" /><span className="hidden xl:inline">任务视角</span><span className="xl:hidden">任务</span>
            </Button>
            <Button size="sm" variant="outline" className={`cursor-pointer bg-background/50 text-xs backdrop-blur ${alertCount ? 'border-destructive/60 text-destructive' : 'border-primary/30'}`} onClick={() => onOpenTab('alerts')} aria-label={`告警中心，${alertCount} 个活动告警`}>
              <BellRing className="h-3.5 w-3.5" /><span className="hidden xl:inline">告警</span>{alertCount > 0 && <span className="font-data">{alertCount}</span>}
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer border-primary/30 bg-background/50 text-xs backdrop-blur" onClick={() => onOpenTab('approvals')}>
              <ShieldQuestion className="h-3.5 w-3.5" /> 确认中心{pending.length > 0 ? `（${pending.length}）` : ''}
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer border-primary/30 bg-background/50 text-xs backdrop-blur" onClick={onOpenMini} aria-label="打开迷你悬浮窗">
              <PictureInPicture2 className="h-3.5 w-3.5" /><span className="hidden xl:inline">悬浮窗</span>
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer border-primary/30 bg-background/50 text-xs backdrop-blur" onClick={onExit}>
              <LayoutGrid className="h-3.5 w-3.5" /><span className="hidden xl:inline">经典视图</span>
            </Button>
            <Button
              size="sm" variant="outline" className="cursor-pointer border-primary/30 bg-background/50 text-xs backdrop-blur" aria-label="全屏"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
            >
              <Maximize className="h-3.5 w-3.5" /> <span className="hidden xl:inline">全屏</span>
            </Button>
            <PageSettings
              cruiseSpeed={orbitSpeed}
              onCruiseSpeedChange={onOrbitSpeedChange}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              renderQuality={renderQuality}
              onRenderQualityChange={onRenderQualityChange}
              onReset={() => { onOrbitSpeedChange(1); onFontSizeChange(112); onRenderQualityChange('ultra') }}
            />
          </div>
        </div>
      </div>

      {/* 左上：全局读数（裸 HUD，无卡片） */}
      <div className="pointer-events-none absolute left-5 top-16 z-10 space-y-1">
        <div className="text-[10px] tracking-widest text-muted-foreground">SYSTEM TELEMETRY</div>
        <div className="font-data text-2xl font-bold text-primary neon-text">{totalCpu.toFixed(0)}<span className="text-sm">%</span></div>
        <div className="font-data text-[11px] text-muted-foreground">总算力 · {groups.length} 智能体 / {scan?.agents.length ?? 0} 进程</div>
        <div className="font-data text-[11px] text-muted-foreground">内存 {totalMem >= 1024 ? (totalMem / 1024).toFixed(1) + ' GB' : totalMem + ' MB'} · 扫描 {scan?.scanned ?? 0}</div>
      </div>

      {/* 右上：待确认信标 */}
      {pending.length > 0 && (
        <div className="absolute right-5 top-16 z-10 w-56 space-y-2">
          <div className="text-right text-[10px] tracking-widest text-[hsl(42_95%_60%)]">AWAITING AUTHORIZATION</div>
          {pending.map((g) => (
            <div key={g.agentId} className="flex items-center justify-end gap-2">
              <span className="font-data text-xs text-[hsl(42_95%_62%)]">{g.name}</span>
              <Button size="sm" className="pointer-events-auto h-6 cursor-pointer bg-[hsl(42_95%_55%)] px-2 text-[11px] text-black hover:bg-[hsl(42_95%_60%)]" onClick={() => onQuickApprove(g)}>
                放行
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 左下：智能体强度榜 */}
      <div className="pointer-events-none absolute bottom-12 left-5 z-10 w-52 space-y-1.5">
        <div className="text-[10px] tracking-widest text-muted-foreground">AGENT INTENSITY</div>
        {groups.map((g) => {
          const i = Math.min(1, (g.cpu ?? 0) / 100)
          const policy = policies[g.agentId]
          return (
            <div key={g.agentId}>
              <div className="flex justify-between font-data text-[11px]">
                <span className={!policy ? 'text-[hsl(42_95%_60%)]' : policy.decision === 'denied' ? 'text-[hsl(0_75%_60%)]' : 'text-foreground'}>{g.name}</span>
                <span className="text-muted-foreground">{g.cpu == null ? '—' : g.cpu.toFixed(0) + '%'}</span>
              </div>
              <div className="mt-0.5 h-1 w-full bg-muted/40">
                <div className="h-full transition-[width] duration-500" style={{ width: `${Math.max(2, i * 100)}%`, background: `hsl(${210 - i * 210}, 100%, 55%)` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* 右下：迷你事件流 */}
      <div className="pointer-events-none absolute bottom-12 right-5 z-10 w-72 space-y-1 text-right">
        <div className="text-[10px] tracking-widest text-muted-foreground">EVENT STREAM</div>
        {events.slice(0, 5).map((e) => (
          <div key={e.id} className="truncate font-data text-[10px] text-muted-foreground">
            {new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false })} · {e.message}
          </div>
        ))}
      </div>

      {/* 底部操作条 */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 py-3 text-[10px] tracking-wider text-muted-foreground">
        <span>拖动旋转 · 滚轮缩放 · 悬停核心球查看子进程</span>
        <button className="pointer-events-auto cursor-pointer underline decoration-primary/40 underline-offset-4 hover:text-primary" onClick={() => onOpenTab('overview')}>监控总览</button>
        <button className="pointer-events-auto cursor-pointer underline decoration-primary/40 underline-offset-4 hover:text-primary" onClick={() => onOpenTab('events')}>事件日志</button>
      </div>
    </div>
  )
}
