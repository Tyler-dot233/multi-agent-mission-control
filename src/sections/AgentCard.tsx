import { useState } from 'react'
import { ChevronDown, ShieldCheck, ShieldQuestion, ShieldX, Skull } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Sparkline } from '@/components/Sparkline'
import type { AgentGroup, HistoryPoint, Policy } from '@/types'

function StatusBadge({ policy }: { policy: Policy | undefined }) {
  if (!policy)
    return (
      <Badge variant="outline" className="gap-1 border-[hsl(42_95%_55%/0.6)] text-[hsl(42_95%_60%)]">
        <ShieldQuestion className="h-3 w-3" /> 待确认
      </Badge>
    )
  if (policy.decision === 'allowed')
    return (
      <Badge variant="outline" className="gap-1 border-[hsl(152_70%_45%/0.6)] text-[hsl(152_70%_55%)]">
        <ShieldCheck className="h-3 w-3" /> 已授权
      </Badge>
    )
  return (
    <Badge variant="outline" className="gap-1 border-[hsl(0_75%_55%/0.6)] text-[hsl(0_75%_60%)]">
      <ShieldX className="h-3 w-3" /> 已拒绝
    </Badge>
  )
}

export function AgentCard({
  group,
  history,
  policy,
  onKill,
}: {
  group: AgentGroup
  history: HistoryPoint[]
  policy: Policy | undefined
  onKill: (pid: number, label: string, agentId: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [killing, setKilling] = useState<number | null>(null)
  const cpuData = history.map((h) => h.cpu)
  const memData = history.map((h) => h.memMB)

  const handleKill = async (pid: number) => {
    setKilling(pid)
    try {
      await onKill(pid, group.name, group.agentId)
    } finally {
      setKilling(null)
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{group.name}</h3>
            <StatusBadge policy={policy} />
          </div>
          <p className="text-xs text-muted-foreground">
            {group.vendor} · {group.processes.length} 个进程
          </p>
        </div>
        <div className="text-right">
          <div className="font-data text-sm">
            CPU {group.cpu == null ? '—' : `${group.cpu.toFixed(1)}%`}
          </div>
          <div className="font-data text-xs text-muted-foreground">
            {group.memMB >= 1024 ? `${(group.memMB / 1024).toFixed(2)} GB` : `${group.memMB} MB`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sparkline data={cpuData} color="hsl(172 80% 45%)" />
          <Sparkline data={memData} color="hsl(220 70% 60%)" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          进程
        </Button>
      </div>

      {expanded && (
        <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {group.processes.map((p) => (
            <li key={p.pid} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-data w-16 text-muted-foreground">#{p.pid}</span>
              <span className="font-data min-w-0 flex-1 truncate text-xs text-muted-foreground" title={p.command}>
                {p.command}
              </span>
              <span className="font-data w-20 text-right text-xs">
                {p.cpu == null ? '—' : `${p.cpu.toFixed(1)}%`} · {p.memMB}MB
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer border-[hsl(0_75%_55%/0.5)] text-[hsl(0_75%_62%)] hover:bg-[hsl(0_75%_55%/0.12)]"
                    disabled={killing === p.pid}
                  >
                    <Skull className="h-3.5 w-3.5" />
                    {killing === p.pid ? '终止中…' : '终止'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认终止该进程？</AlertDialogTitle>
                    <AlertDialogDescription>
                      将向 {group.name} 的进程 #{p.pid} 发送终止信号（SIGTERM）。未保存的工作可能丢失。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleKill(p.pid)}
                    >
                      确认终止
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
