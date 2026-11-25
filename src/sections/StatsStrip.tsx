import { Activity, Bot, Cpu, MemoryStick, ShieldQuestion } from 'lucide-react'

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="hud-frame flex items-center gap-3 rounded-lg border border-primary/20 bg-card/70 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-data text-lg font-semibold leading-tight">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  )
}

export function StatsStrip({
  agentCount,
  processCount,
  totalCpu,
  totalMemMB,
  pendingCount,
  scanned,
}: {
  agentCount: number
  processCount: number
  totalCpu: number | null
  totalMemMB: number
  pendingCount: number
  scanned: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Stat icon={<Bot className="h-4 w-4" />} label="活跃智能体" value={String(agentCount)} sub={`${processCount} 个进程`} />
      <Stat icon={<Cpu className="h-4 w-4" />} label="合计 CPU" value={totalCpu == null ? '—' : `${totalCpu.toFixed(1)}%`} sub="全部 AI 进程" />
      <Stat
        icon={<MemoryStick className="h-4 w-4" />}
        label="合计内存"
        value={totalMemMB >= 1024 ? `${(totalMemMB / 1024).toFixed(1)} GB` : `${totalMemMB} MB`}
        sub="全部 AI 进程"
      />
      <Stat icon={<Activity className="h-4 w-4" />} label="系统进程" value={String(scanned)} sub="本轮已扫描" />
      <Stat
        icon={<ShieldQuestion className="h-4 w-4" />}
        label="待确认"
        value={String(pendingCount)}
        sub={pendingCount > 0 ? '需要您的工作前确认' : '策略全部就绪'}
      />
    </div>
  )
}
