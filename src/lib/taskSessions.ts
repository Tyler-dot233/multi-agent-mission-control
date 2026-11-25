import type { AgentGroup, AgentProcess, TaskSession } from '@/types'
import { summarizeWork } from '@/lib/workLabel'

function elapsedSeconds(etime: string): number | null {
  if (!etime) return null
  const [clock, dayPart] = etime.includes('-') ? etime.split('-').reverse() : [etime, '0']
  const parts = clock.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  const days = Number(dayPart) || 0
  let seconds = days * 86400
  if (parts.length === 3) seconds += parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) seconds += parts[0] * 60 + parts[1]
  else return null
  return seconds
}

function rootFor(process: AgentProcess, byPid: Map<number, AgentProcess>): number {
  if (!process.ppid) return 0
  let current = process
  const visited = new Set<number>()
  while (current.ppid && byPid.has(current.ppid) && !visited.has(current.pid)) {
    visited.add(current.pid)
    current = byPid.get(current.ppid)!
  }
  return current.pid
}

/**
 * 将进程聚合为“推断任务会话”。macOS/Linux 使用进程树，Windows 在缺少父进程
 * 信息时按智能体聚合。这里不会冒充智能体内部的真实对话或任务 ID。
 */
export function buildTaskSessions(groups: AgentGroup[], timestamp = Date.now()): TaskSession[] {
  const sessions: TaskSession[] = []

  for (const group of groups) {
    const byPid = new Map(group.processes.map((p) => [p.pid, p]))
    const buckets = new Map<number, AgentProcess[]>()
    const hasParentData = group.processes.some((p) => p.ppid > 0)

    for (const process of group.processes) {
      const rootPid = hasParentData ? rootFor(process, byPid) : 0
      const bucket = buckets.get(rootPid) ?? []
      bucket.push(process)
      buckets.set(rootPid, bucket)
    }

    for (const [rootPid, processes] of buckets) {
      const stage = summarizeWork({ processes }, 1)[0]?.label ?? '主进程驻留'
      const cpuValues = processes.filter((p) => p.cpu != null)
      const cpu = cpuValues.length === 0
        ? null
        : Math.round(cpuValues.reduce((sum, p) => sum + (p.cpu ?? 0), 0) * 10) / 10
      const root = processes.find((p) => p.pid === rootPid) ?? processes[0]
      const elapsed = elapsedSeconds(root?.etime ?? '')

      sessions.push({
        id: `${group.agentId}:${rootPid || 'all'}`,
        agentId: group.agentId,
        agentName: group.name,
        rootPid,
        title: `${group.name} · ${stage}`,
        stage,
        processes: [...processes].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)),
        cpu,
        memMB: processes.reduce((sum, p) => sum + p.memMB, 0),
        startedAt: elapsed == null ? null : timestamp - elapsed * 1000,
        inferred: true,
      })
    }
  }

  return sessions.sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0) || b.memMB - a.memMB)
}

export function formatSessionDuration(session: TaskSession, now = Date.now()): string {
  if (!session.startedAt) return '时长未知'
  const seconds = Math.max(0, Math.floor((now - session.startedAt) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分钟`
  return `${seconds} 秒`
}
