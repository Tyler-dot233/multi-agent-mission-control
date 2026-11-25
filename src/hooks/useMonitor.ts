import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentGroup, MonitorEvent, ScanResult, HistoryPoint, EventKind } from '@/types'
import { emitSceneEvent } from '@/lib/sceneEvents'

const POLL_MS = 2000
const HISTORY_LEN = 40
const EVENTS_KEY = 'aimon.events.v1'
const EVENTS_CAP = 300

function loadEvents(): MonitorEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function groupAgents(scan: ScanResult | null): AgentGroup[] {
  if (!scan) return []
  const map = new Map<string, AgentGroup>()
  for (const p of scan.agents) {
    let g = map.get(p.agentId)
    if (!g) {
      g = { agentId: p.agentId, name: p.name, vendor: p.vendor, processes: [], cpu: 0, memMB: 0 }
      map.set(p.agentId, g)
    }
    g.processes.push(p)
    g.memMB += p.memMB
    if (p.cpu != null) g.cpu = (g.cpu ?? 0) + p.cpu
  }
  for (const g of map.values()) {
    if (g.processes.every((p) => p.cpu == null)) g.cpu = null
    else g.cpu = Math.round((g.cpu ?? 0) * 10) / 10
  }
  return [...map.values()].sort((a, b) => b.memMB - a.memMB)
}

export function useMonitor() {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({})
  const [events, setEvents] = useState<MonitorEvent[]>(loadEvents)
  const knownRef = useRef<Set<string> | null>(null)

  const pushEvent = useCallback((kind: EventKind, message: string) => {
    setEvents((prev) => {
      const next = [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), kind, message },
        ...prev,
      ].slice(0, EVENTS_CAP)
      try { localStorage.setItem(EVENTS_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  const tick = useCallback(async () => {
    try {
      const res = await fetch('/api/scan')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ScanResult
      setScan(data)
      setConnected(true)
      setError(null)

      const current = new Set(data.agents.map((a) => a.agentId))
      if (knownRef.current === null) {
        // first successful scan: record baseline without "appeared" noise
        if (current.size > 0) {
          pushEvent('info', `基线扫描完成：发现 ${current.size} 个 AI 智能体（共扫描 ${data.scanned} 个进程）`)
        } else {
          pushEvent('info', `基线扫描完成：未发现 AI 智能体进程（共扫描 ${data.scanned} 个进程）`)
        }
      } else {
        for (const id of current) {
          if (!knownRef.current.has(id)) {
            const p = data.agents.find((a) => a.agentId === id)!
            pushEvent('appeared', `检测到新的智能体活动：${p.name}（PID ${p.pid}）`)
            emitSceneEvent({ type: 'appear', agentId: id })
          }
        }
        for (const id of knownRef.current) {
          if (!current.has(id)) pushEvent('gone', `智能体进程已退出：${id}`)
        }
      }
      knownRef.current = current

      setHistory((prev) => {
        const next = { ...prev }
        const groups = groupAgents(data)
        for (const g of groups) {
          const arr = next[g.agentId] ? [...next[g.agentId]] : []
          arr.push({ ts: data.timestamp, cpu: g.cpu ?? 0, memMB: g.memMB })
          next[g.agentId] = arr.slice(-HISTORY_LEN)
        }
        return next
      })
    } catch (err: any) {
      setConnected(false)
      setError(String(err?.message || err))
    }
  }, [pushEvent])

  useEffect(() => {
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => clearInterval(t)
  }, [tick])

  const kill = useCallback(
    async (pid: number, label: string) => {
      const res = await fetch('/api/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      pushEvent('killed', `已终止进程：${label}（PID ${pid}）`)
      await tick()
    },
    [pushEvent, tick],
  )

  return { scan, connected, error, history, events, pushEvent, kill }
}
