import { Clock3, Crosshair, Cpu, MemoryStick, Workflow } from 'lucide-react'
import type { TaskSession } from '@/types'
import { formatSessionDuration } from '@/lib/taskSessions'
import { summarizeWork } from '@/lib/workLabel'
import { Button } from '@/components/ui/button'

export function TaskSessionView({ sessions, onLocate }: { sessions: TaskSession[]; onLocate: (agentId: string) => void }) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Workflow className="h-4 w-4" /> 任务／会话聚合</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">依据进程树和命令行推断工作阶段，不代表智能体内部的真实对话 ID。</p>
        </div>
        <div className="font-data text-right text-xs text-muted-foreground">
          <div><span className="text-xl text-primary">{sessions.length}</span> 个推断会话</div>
          <div>{sessions.reduce((sum, s) => sum + s.processes.length, 0)} 个关联进程</div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">等待进程扫描后生成任务会话。</div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const work = summarizeWork(session, 4)
            const intensity = Math.min(1, (session.cpu ?? 0) / 100)
            return (
              <section key={session.id} className="rounded-lg border border-border/70 bg-card/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{session.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-data text-[11px] text-muted-foreground">
                      <span>会话 {session.rootPid ? `#${session.rootPid}` : '聚合视图'}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatSessionDuration(session)}</span>
                      <span>{session.processes.length} 个进程</span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="cursor-pointer border-primary/30 text-xs" onClick={() => onLocate(session.agentId)}>
                    <Crosshair className="h-3.5 w-3.5" /> 星环定位
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 font-data text-xs sm:grid-cols-4">
                  <div className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-primary" /><span>{session.cpu == null ? 'CPU —' : `CPU ${session.cpu.toFixed(1)}%`}</span></div>
                  <div className="flex items-center gap-2"><MemoryStick className="h-3.5 w-3.5 text-primary" /><span>{session.memMB >= 1024 ? `${(session.memMB / 1024).toFixed(2)} GB` : `${session.memMB} MB`}</span></div>
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">处理强度</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(3, intensity * 100)}%` }} /></div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {work.map((item) => <span key={item.label} className="rounded border border-border/70 px-2 py-1 font-data text-[10px] text-muted-foreground">{item.label} ×{item.count}{item.cpu != null ? ` · ${item.cpu.toFixed(1)}%` : ''}</span>)}
                </div>

                <details className="group mt-3 min-w-0 border-t border-border/50 pt-2">
                  <summary className="cursor-pointer list-none rounded px-1 py-2 text-xs text-primary outline-none transition-colors hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">查看进程明细</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse font-data text-[11px]">
                      <thead><tr className="text-left text-muted-foreground"><th className="py-2 font-normal">PID / PPID</th><th className="py-2 font-normal">工作类型</th><th className="py-2 font-normal">CPU</th><th className="py-2 font-normal">内存</th><th className="py-2 font-normal">运行时长</th></tr></thead>
                      <tbody>{session.processes.map((p) => <tr key={p.pid} className="border-t border-border/40"><td className="py-2">{p.pid} / {p.ppid || '—'}</td><td className="py-2">{summarizeWork({ processes: [p] }, 1)[0]?.label}</td><td className="py-2">{p.cpu == null ? '—' : `${p.cpu.toFixed(1)}%`}</td><td className="py-2">{p.memMB} MB</td><td className="py-2">{p.etime || '—'}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
