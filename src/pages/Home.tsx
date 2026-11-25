import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster, toast } from 'sonner'
import { Radar } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HeaderBar } from '@/sections/HeaderBar'
import { StatsStrip } from '@/sections/StatsStrip'
import { AgentCard } from '@/sections/AgentCard'
import { ApprovalCenter } from '@/sections/ApprovalCenter'
import { EventLog } from '@/sections/EventLog'
import { FlowField3D } from '@/sections/FlowField3D'
import { Presentation } from '@/sections/Presentation'
import { TaskSessionView } from '@/sections/TaskSessionView'
import { AlertCenter } from '@/sections/AlertCenter'
import { MiniWidget } from '@/sections/MiniWidget'
import { useMonitor, groupAgents } from '@/hooks/useMonitor'
import { useApprovals } from '@/hooks/useApprovals'
import { useAlerts } from '@/hooks/useAlerts'
import { emitSceneEvent } from '@/lib/sceneEvents'
import { loadOrbitSpeed, saveOrbitSpeed } from '@/lib/orbitSpeed'
import { FONT_SIZE_KEY, loadFontSize } from '@/lib/fontSize'
import { loadRenderQuality, saveRenderQuality } from '@/lib/renderQuality'
import { buildTaskSessions } from '@/lib/taskSessions'
import type { AgentGroup, Decision, HistoryPoint } from '@/types'

const TREND_LEN = 60
const IS_MINI = new URLSearchParams(window.location.search).get('mini') === '1'
const OVERLAY_TABS = ['overview', 'tasks', 'alerts', 'approvals', 'events']
type OverlayTab = 'overview' | 'tasks' | 'alerts' | 'approvals' | 'events' | null

export default function Home() {
  const { scan, connected, error, history, events, pushEvent, kill } = useMonitor()
  const { policies, decide, revoke } = useApprovals()
  const [trend, setTrend] = useState<HistoryPoint[]>([])
  const [bigScreen, setBigScreen] = useState(true) // 默认大屏作战模式
  const [orbitSpeed, setOrbitSpeed] = useState(loadOrbitSpeed)
  const [fontSize, setFontSize] = useState(loadFontSize)
  const [renderQuality, setRenderQuality] = useState(loadRenderQuality)
  const [overlay, setOverlay] = useState<OverlayTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    return OVERLAY_TABS.includes(tab ?? '') ? tab as OverlayTab : null
  })

  useEffect(() => saveOrbitSpeed(orbitSpeed), [orbitSpeed])
  useEffect(() => saveRenderQuality(renderQuality), [renderQuality])
  useEffect(() => {
    if (!IS_MINI) document.documentElement.style.fontSize = `${fontSize}%`
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(fontSize))
    } catch {
      // 无持久化权限时仍可在当前会话调节。
    }
  }, [fontSize])

  const groups = useMemo(() => groupAgents(scan), [scan])
  const sessions = useMemo(() => buildTaskSessions(groups, scan?.timestamp), [groups, scan?.timestamp])
  const { alerts, activeAlerts, settings: alertSettings, updateSettings, acknowledge, clearResolved, setNotifications } = useAlerts(groups, connected)
  const pending = useMemo(() => groups.filter((g) => !policies[g.agentId]), [groups, policies])
  const decided = useMemo(
    () => Object.values(policies).sort((a, b) => b.decidedAt - a.decidedAt),
    [policies],
  )
  const activeIds = useMemo(() => new Set(groups.map((g) => g.agentId)), [groups])

  const totalCpu = groups.every((g) => g.cpu == null)
    ? null
    : groups.reduce((s, g) => s + (g.cpu ?? 0), 0)
  const totalMem = groups.reduce((s, g) => s + g.memMB, 0)

  useEffect(() => {
    if (!scan) return
    // 每次外部扫描完成后才追加一个趋势点，不在渲染期间更新。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrend((prev) =>
      [...prev, { ts: scan.timestamp, cpu: totalCpu ?? 0, memMB: totalMem }].slice(-TREND_LEN),
    )
  }, [scan]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => window.aimonDesktop?.onOpenTab((tab) => {
    if (OVERLAY_TABS.includes(tab)) {
      setBigScreen(true)
      setOverlay(tab as OverlayTab)
    }
  }), [])

  const openMini = () => {
    if (window.aimonDesktop) {
      void window.aimonDesktop.openMini()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('mini', '1')
    window.location.assign(url)
  }

  const handleDecide = async (g: AgentGroup, d: Decision) => {
    decide(g.agentId, g.name, d)
    if (d === 'allowed') {
      emitSceneEvent({ type: 'approve', agentId: g.agentId })
      pushEvent('approved', `已授权智能体：${g.name}`)
      toast.success(`已放行 ${g.name}`)
    } else {
      emitSceneEvent({ type: 'kill', agentId: g.agentId })
      pushEvent('denied', `已拒绝智能体：${g.name}，正在终止其进程`)
      toast.warning(`已拒绝 ${g.name}，正在终止进程`)
      for (const p of g.processes) {
        try {
          await kill(p.pid, g.name)
        } catch (err: unknown) {
          pushEvent('error', `终止 ${g.name}（PID ${p.pid}）失败：${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }

  const handleKill = async (pid: number, label: string) => {
    try {
      await kill(pid, label)
      emitSceneEvent({ type: 'kill' })
      toast.success(`已终止 ${label}（PID ${pid}）`)
    } catch (err: unknown) {
      toast.error(`终止失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (IS_MINI) {
    return <MiniWidget groups={groups} connected={connected} totalCpu={totalCpu} totalMem={totalMem} alertCount={activeAlerts.length} />
  }

  const overviewBody = (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-card/70 p-4">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
          全局资源趋势 <span className="font-data font-normal">CPU% / 内存MB</span>
        </h2>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="ts" hide />
              <YAxis yAxisId="cpu" hide domain={[0, 'dataMax + 10']} />
              <YAxis yAxisId="mem" hide orientation="right" domain={[0, 'dataMax + 512']} />
              <Tooltip
                contentStyle={{ background: 'hsl(222 32% 8%)', border: '1px solid hsl(220 16% 16%)', fontSize: 12 }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString('zh-CN', { hour12: false })}
                formatter={(value: number, name: string) =>
                  name === 'cpu' ? [`${value.toFixed(1)}%`, 'CPU'] : [`${Math.round(value)} MB`, '内存']
                }
              />
              <Area yAxisId="cpu" type="monotone" dataKey="cpu" stroke="hsl(172 80% 45%)" fill="hsl(172 80% 45%)" fillOpacity={0.15} isAnimationActive={false} />
              <Area yAxisId="mem" type="monotone" dataKey="memMB" stroke="hsl(220 70% 60%)" fill="hsl(220 70% 60%)" fillOpacity={0.1} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {groups.length === 0 ? (
        <Empty className="border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Radar className="h-5 w-5" /></EmptyMedia>
            <EmptyTitle>{connected ? '当前没有检测到 AI 智能体进程' : '等待监控服务连接…'}</EmptyTitle>
            <EmptyDescription>
              特征库覆盖 Kimi、Claude、Cursor、ChatGPT、Ollama、豆包、Qoder 等 20+ 种智能体。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <AgentCard
              key={g.agentId}
              group={g}
              history={history[g.agentId] ?? []}
              policy={policies[g.agentId]}
              onKill={handleKill}
            />
          ))}
        </div>
      )}
    </div>
  )

  const approvalsBody = (
    <ApprovalCenter
      pending={pending}
      decided={decided}
      activeIds={activeIds}
      onDecide={handleDecide}
      onRevoke={(id) => {
        revoke(id)
        pushEvent('info', `已撤销策略：${policies[id]?.name ?? id}，下次检测到将重新请求确认`)
      }}
    />
  )

  const locateAgent = (agentId: string, alert = false) => {
    setOverlay(null)
    setBigScreen(true)
    emitSceneEvent({ type: alert ? 'alert' : 'focus', agentId })
  }
  const tasksBody = <TaskSessionView sessions={sessions} onLocate={(id) => locateAgent(id)} />
  const alertsBody = (
    <AlertCenter
      alerts={alerts}
      settings={alertSettings}
      onSettings={updateSettings}
      onAcknowledge={acknowledge}
      onClearResolved={clearResolved}
      onLocate={(id) => locateAgent(id, true)}
      onNotifications={setNotifications}
    />
  )
  const overlayTitles = { overview: '监控总览', tasks: '任务／会话视角', alerts: '智能告警中心', approvals: '确认中心', events: '事件日志' }

  // ── 大屏作战模式（默认）──
  if (bigScreen) {
    return (
      <div className="min-h-dvh bg-background">
        <Presentation
          scan={scan}
          connected={connected}
          groups={groups}
          policies={policies}
          pending={pending}
          events={events}
          alertCount={activeAlerts.length}
          orbitSpeed={orbitSpeed}
          onOrbitSpeedChange={setOrbitSpeed}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          renderQuality={renderQuality}
          onRenderQualityChange={setRenderQuality}
          onOpenTab={(tab) => setOverlay(tab)}
          onOpenMini={openMini}
          onExit={() => setBigScreen(false)}
          onQuickApprove={(g) => handleDecide(g, 'allowed')}
        />
        <Dialog open={overlay !== null} onOpenChange={(open) => !open && setOverlay(null)}>
          <DialogContent className="max-h-[85dvh] min-w-0 max-w-5xl overflow-y-auto border-primary/25 bg-[hsl(222_32%_7%)]">
            <DialogHeader>
              <DialogTitle>{overlay ? overlayTitles[overlay] : ''}</DialogTitle>
            </DialogHeader>
            {overlay === 'overview' && overviewBody}
            {overlay === 'tasks' && tasksBody}
            {overlay === 'alerts' && alertsBody}
            {overlay === 'approvals' && approvalsBody}
            {overlay === 'events' && <EventLog events={events} />}
          </DialogContent>
        </Dialog>
        <Toaster theme="dark" position="bottom-right" />
      </div>
    )
  }

  // ── 经典视图 ──
  return (
    <div className="min-h-dvh bg-background">
      <div className="cyber-overlay" aria-hidden />
      <HeaderBar
        platform={scan?.platform ?? null}
        connected={connected}
        pendingCount={pending.length}
        cruiseSpeed={orbitSpeed}
        onCruiseSpeedChange={setOrbitSpeed}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        renderQuality={renderQuality}
        onRenderQualityChange={setRenderQuality}
      />

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-6">
        {!connected && (
          <div className="rounded-lg border border-[hsl(0_75%_55%/0.5)] bg-[hsl(0_75%_55%/0.08)] px-4 py-3 text-sm">
            无法连接本机监控服务{error ? `（${error}）` : ''}。请通过 <code className="font-data">npm run dev</code> 或{' '}
            <code className="font-data">npm run start</code> 启动应用后再访问。
          </div>
        )}

        <StatsStrip
          agentCount={groups.length}
          processCount={scan?.agents.length ?? 0}
          totalCpu={totalCpu}
          totalMemMB={totalMem}
          pendingCount={pending.length}
          scanned={scan?.scanned ?? 0}
        />

        <Tabs defaultValue="flow">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="flow" className="cursor-pointer">信息流</TabsTrigger>
            <TabsTrigger value="overview" className="cursor-pointer">监控总览</TabsTrigger>
            <TabsTrigger value="tasks" className="cursor-pointer">任务视角</TabsTrigger>
            <TabsTrigger value="alerts" className="cursor-pointer gap-1.5">
              告警{activeAlerts.length > 0 && <Badge className="h-5 min-w-5 bg-destructive px-1 text-xs">{activeAlerts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approvals" className="cursor-pointer gap-1.5">
              确认中心
              {pending.length > 0 && (
                <Badge className="h-5 min-w-5 bg-[hsl(42_95%_55%)] px-1 text-xs text-black">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="events" className="cursor-pointer">事件日志</TabsTrigger>
            <button className="ml-auto cursor-pointer px-3 text-xs text-muted-foreground underline decoration-primary/40 underline-offset-4 hover:text-primary" onClick={() => setBigScreen(true)}>
              返回大屏
            </button>
          </TabsList>

          <TabsContent value="flow">
            <div className="hud-frame rounded-lg border border-primary/25 bg-card/70 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
                <h2 className="neon-text text-sm font-semibold tracking-widest text-primary">信息流 · 神经星环</h2>
                <p className="text-xs text-muted-foreground">
                  拖动旋转 · 滚轮缩放 · 悬停核心球查看子进程 TOP5 · 卫星转速 = 子进程强度
                </p>
              </div>
              <div className="h-[560px]">
                <FlowField3D groups={groups} policies={policies} orbitSpeed={orbitSpeed} quality={renderQuality} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">{overviewBody}</TabsContent>
          <TabsContent value="tasks">{tasksBody}</TabsContent>
          <TabsContent value="alerts">{alertsBody}</TabsContent>
          <TabsContent value="approvals">{approvalsBody}</TabsContent>
          <TabsContent value="events"><EventLog events={events} /></TabsContent>
        </Tabs>

        <footer className="pb-4 pt-2 text-center text-xs text-muted-foreground">
          多智能体监控台 · 数据每 2 秒刷新 · 策略与日志保存在本机浏览器 · 支持 Windows / macOS
        </footer>
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  )
}
