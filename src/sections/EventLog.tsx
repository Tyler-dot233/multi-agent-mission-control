import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollText } from 'lucide-react'
import type { MonitorEvent, EventKind } from '@/types'

const KIND_STYLE: Record<EventKind, { label: string; cls: string }> = {
  appeared: { label: '出现', cls: 'text-[hsl(42_95%_60%)]' },
  gone: { label: '退出', cls: 'text-muted-foreground' },
  approved: { label: '授权', cls: 'text-[hsl(152_70%_55%)]' },
  denied: { label: '拒绝', cls: 'text-[hsl(0_75%_62%)]' },
  killed: { label: '终止', cls: 'text-[hsl(0_75%_62%)]' },
  error: { label: '错误', cls: 'text-[hsl(0_75%_62%)]' },
  info: { label: '信息', cls: 'text-[hsl(220_70%_65%)]' },
}

export function EventLog({ events }: { events: MonitorEvent[] }) {
  if (events.length === 0) {
    return (
      <Empty className="border-border/70">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ScrollText className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>暂无事件</EmptyTitle>
          <EmptyDescription>智能体的出现、退出、授权与终止都会记录在这里。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <ScrollArea className="log-scroll h-[560px] rounded-lg border border-border/70 bg-card/70">
      <ul className="divide-y divide-border/50">
        {events.map((e) => {
          const s = KIND_STYLE[e.kind]
          return (
            <li key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
              <span className="font-data shrink-0 text-xs text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span className={`font-data w-10 shrink-0 text-xs ${s.cls}`}>[{s.label}]</span>
              <span className="min-w-0 break-all">{e.message}</span>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
