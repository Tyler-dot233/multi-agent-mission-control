import { useState } from 'react'
import { CheckCircle2, ListChecks, RotateCcw, ShieldCheck, ShieldX, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { AgentGroup, Decision, Policy } from '@/types'

function riskNote(g: AgentGroup): string {
  const notes: string[] = []
  if (g.cpu != null && g.cpu > 50) notes.push('CPU 占用较高，可能正在执行重负载任务')
  if (g.memMB > 2048) notes.push('内存占用超过 2 GB，建议关注')
  if (g.processes.length > 5) notes.push(`包含 ${g.processes.length} 个进程，活动范围较广`)
  if (notes.length === 0) notes.push('资源占用正常，未发现异常信号')
  return notes.join('；')
}

function PendingCard({
  group,
  busy,
  onDecide,
}: {
  group: AgentGroup
  busy: boolean
  onDecide: (g: AgentGroup, d: Decision) => Promise<void>
}) {
  const details: [string, string][] = [
    ['智能体', `${group.name}（${group.vendor}）`],
    ['进程数', `${group.processes.length} 个 · PID ${group.processes.map((p) => p.pid).join(', ')}`],
    ['资源占用', `CPU ${group.cpu == null ? '—' : group.cpu.toFixed(1) + '%'} · 内存 ${group.memMB >= 1024 ? (group.memMB / 1024).toFixed(2) + ' GB' : group.memMB + ' MB'}`],
    ['启动时长', group.processes[0]?.etime || '—'],
    ['可执行路径', group.processes[0]?.command.split(' ')[0] || '—'],
    ['评估建议', riskNote(group)],
  ]
  return (
    <div className="rounded-lg border border-[hsl(42_95%_55%/0.4)] bg-card/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[hsl(42_95%_60%)]" aria-hidden />
        <h3 className="font-semibold">{group.name} 请求工作授权</h3>
        <Badge variant="outline" className="border-[hsl(42_95%_55%/0.6)] text-[hsl(42_95%_60%)]">待确认</Badge>
      </div>
      <dl className="mb-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {details.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-sm">
            <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="font-data min-w-0 flex-1 break-all text-xs leading-5">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="cursor-pointer" disabled={busy} onClick={() => onDecide(group, 'allowed')}>
          <CheckCircle2 className="h-4 w-4" /> 确认放行
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer border-[hsl(0_75%_55%/0.5)] text-[hsl(0_75%_62%)] hover:bg-[hsl(0_75%_55%/0.12)]"
              disabled={busy}
            >
              <XCircle className="h-4 w-4" /> 拒绝并终止
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>拒绝并终止 {group.name}？</AlertDialogTitle>
              <AlertDialogDescription>
                将终止该智能体的全部 {group.processes.length} 个进程，并记录为「已拒绝」。之后再次检测到时会重新请求确认。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer">取消</AlertDialogCancel>
              <AlertDialogAction
                className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDecide(group, 'denied')}
              >
                拒绝并终止
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export function ApprovalCenter({
  pending,
  decided,
  activeIds,
  onDecide,
  onRevoke,
}: {
  pending: AgentGroup[]
  decided: Policy[]
  activeIds: Set<string>
  onDecide: (g: AgentGroup, d: Decision) => Promise<void>
  onRevoke: (agentId: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const handle = async (g: AgentGroup, d: Decision) => {
    setBusyId(g.agentId)
    try {
      await onDecide(g, d)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">待确认（{pending.length}）</h2>
        {pending.length === 0 ? (
          <Empty className="border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ShieldCheck className="h-5 w-5" /></EmptyMedia>
              <EmptyTitle>没有待确认的授权请求</EmptyTitle>
              <EmptyDescription>检测到新的 AI 智能体活动时，会在这里等待您的工作前确认。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {pending.map((g) => (
              <PendingCard key={g.agentId} group={g} busy={busyId === g.agentId} onDecide={handle} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">已决定的策略（{decided.length}）</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无记录。</p>
        ) : (
          <ul className="space-y-2">
            {decided.map((p) => (
              <li
                key={p.agentId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/70 px-4 py-2.5"
              >
                {p.decision === 'allowed' ? (
                  <ShieldCheck className="h-4 w-4 text-[hsl(152_70%_50%)]" aria-hidden />
                ) : (
                  <ShieldX className="h-4 w-4 text-[hsl(0_75%_58%)]" aria-hidden />
                )}
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline" className="font-data text-xs">
                  {p.decision === 'allowed' ? '已授权' : '已拒绝'}
                </Badge>
                {activeIds.has(p.agentId) && (
                  <Badge variant="outline" className="border-[hsl(152_70%_45%/0.6)] text-[hsl(152_70%_55%)] text-xs">运行中</Badge>
                )}
                <span className="font-data text-xs text-muted-foreground">
                  {new Date(p.decidedAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto cursor-pointer text-muted-foreground"
                  onClick={() => onRevoke(p.agentId)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 撤销
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
