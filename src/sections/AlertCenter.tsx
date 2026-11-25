import { BellRing, Check, Crosshair, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { AlertItem, AlertSettings } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export function AlertCenter({
  alerts,
  settings,
  onSettings,
  onAcknowledge,
  onClearResolved,
  onLocate,
  onNotifications,
}: {
  alerts: AlertItem[]
  settings: AlertSettings
  onSettings: (patch: Partial<AlertSettings>) => void
  onAcknowledge: (id: string) => void
  onClearResolved: () => void
  onLocate: (agentId: string) => void
  onNotifications: (enabled: boolean) => Promise<boolean>
}) {
  const activeCount = alerts.filter((a) => a.active).length
  const resolvedCount = alerts.length - activeCount

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-xs text-muted-foreground">
          <span>CPU 告警阈值（%）</span>
          <Input className="font-data" type="number" min={10} max={1000} value={settings.cpuPercent} onChange={(e) => onSettings({ cpuPercent: Math.max(10, Number(e.target.value) || 80) })} />
        </label>
        <label className="space-y-2 text-xs text-muted-foreground">
          <span>内存告警阈值（MB）</span>
          <Input className="font-data" type="number" min={256} step={256} value={settings.memoryMB} onChange={(e) => onSettings({ memoryMB: Math.max(256, Number(e.target.value) || 4096) })} />
        </label>
        <label className="space-y-2 text-xs text-muted-foreground">
          <span>低活动告警（分钟，0 关闭）</span>
          <Input className="font-data" type="number" min={0} max={1440} value={settings.idleMinutes} onChange={(e) => onSettings({ idleMinutes: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">离线告警</span><Switch checked={settings.offline} onCheckedChange={(offline) => onSettings({ offline })} /></div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">系统通知</span>
            <Switch checked={settings.notifications} onCheckedChange={(enabled) => { void onNotifications(enabled).then((ok) => { if (!ok) toast.error('系统通知未获授权，请检查系统通知权限') }) }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4 text-primary" /><span><span className="font-data text-primary">{activeCount}</span> 个活动告警</span><span className="text-muted-foreground">· {resolvedCount} 个已恢复</span></div>
        <Button size="sm" variant="ghost" className="cursor-pointer text-xs" disabled={resolvedCount === 0} onClick={onClearResolved}><Trash2 className="h-3.5 w-3.5" /> 清除已恢复</Button>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-primary" />
          <div className="text-sm">当前没有告警</div>
          <p className="mt-1 text-xs text-muted-foreground">系统会持续检查资源阈值、低活动、智能体退出和监控服务离线。</p>
        </div>
      ) : (
        <div className="log-scroll max-h-[48dvh] space-y-2 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <article key={alert.id} className={`rounded-lg border p-3 ${alert.active ? alert.severity === 'critical' ? 'border-destructive/50 bg-destructive/5' : 'border-[hsl(42_95%_55%/0.4)] bg-[hsl(42_95%_55%/0.05)]' : 'border-border/50 opacity-65'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${alert.severity === 'critical' ? 'text-destructive' : 'text-[hsl(42_95%_60%)]'}`} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{alert.title}{alert.acknowledged && <span className="ml-2 text-xs font-normal text-muted-foreground">已知晓</span>}{!alert.active && <span className="ml-2 text-xs font-normal text-primary">已恢复</span>}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.message}</p>
                    <div className="mt-1 font-data text-[10px] text-muted-foreground">{new Date(alert.ts).toLocaleString('zh-CN', { hour12: false })}</div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {alert.agentId && <Button size="sm" variant="outline" className="cursor-pointer text-xs" onClick={() => onLocate(alert.agentId!)}><Crosshair className="h-3.5 w-3.5" /> 定位</Button>}
                  {!alert.acknowledged && <Button size="sm" variant="ghost" className="cursor-pointer text-xs" onClick={() => onAcknowledge(alert.id)}><Check className="h-3.5 w-3.5" /> 知晓</Button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
