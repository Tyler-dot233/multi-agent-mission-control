import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentGroup, AlertItem, AlertSettings } from '@/types'

const SETTINGS_KEY = 'aimon.alerts.settings.v1'
const ALERT_CAP = 100
const RECALL_COOLDOWN = 5 * 60 * 1000

const DEFAULT_SETTINGS: AlertSettings = {
  cpuPercent: 80,
  memoryMB: 4096,
  idleMinutes: 10,
  offline: true,
  notifications: false,
}

function loadSettings(): AlertSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

type Candidate = Pick<AlertItem, 'id' | 'kind' | 'severity' | 'agentId' | 'title' | 'message'>

export function useAlerts(groups: AgentGroup[], connected: boolean) {
  const [settings, setSettings] = useState<AlertSettings>(loadSettings)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const alertsRef = useRef<AlertItem[]>([])
  const lastActiveRef = useRef<Record<string, number>>({})
  const previousIdsRef = useRef<Set<string> | null>(null)
  const departedRef = useRef(new Map<string, { name: string; until: number }>())
  const lastFiredRef = useRef(new Map<string, number>())
  const hasConnectedRef = useRef(false)

  const commit = useCallback((next: AlertItem[]) => {
    alertsRef.current = next
    setAlerts(next)
  }, [])

  const updateSettings = useCallback((patch: Partial<AlertSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage quota */ }
  }, [settings])

  useEffect(() => {
    const now = Date.now()
    const candidates: Candidate[] = []
    const currentIds = new Set(groups.map((g) => g.agentId))

    if (!connected && settings.offline && hasConnectedRef.current) {
      candidates.push({ id: 'offline:monitor', kind: 'offline', severity: 'critical', title: '监控服务离线', message: '无法读取本机进程数据，请检查桌面应用或监控服务。' })
    }
    if (connected) hasConnectedRef.current = true

    if (previousIdsRef.current) {
      for (const id of previousIdsRef.current) {
        if (!currentIds.has(id)) departedRef.current.set(id, { name: id, until: now + 60000 })
      }
    }
    previousIdsRef.current = currentIds

    for (const group of groups) {
      const departed = departedRef.current.get(group.agentId)
      if (departed) departed.name = group.name

      if (group.cpu != null && group.cpu >= settings.cpuPercent) {
        candidates.push({ id: `cpu:${group.agentId}`, kind: 'cpu', severity: group.cpu >= settings.cpuPercent * 1.5 ? 'critical' : 'warning', agentId: group.agentId, title: `${group.name} 算力过高`, message: `当前 CPU ${group.cpu.toFixed(1)}%，已超过 ${settings.cpuPercent}% 阈值。` })
      }
      if (group.memMB >= settings.memoryMB) {
        candidates.push({ id: `memory:${group.agentId}`, kind: 'memory', severity: group.memMB >= settings.memoryMB * 2 ? 'critical' : 'warning', agentId: group.agentId, title: `${group.name} 内存过高`, message: `当前内存 ${(group.memMB / 1024).toFixed(2)} GB，已超过 ${(settings.memoryMB / 1024).toFixed(1)} GB 阈值。` })
      }

      if (group.cpu != null) {
        const lastActive = lastActiveRef.current[group.agentId] ?? now
        if (group.cpu >= 1) lastActiveRef.current[group.agentId] = now
        else {
          lastActiveRef.current[group.agentId] = lastActive
          const idleMinutes = (now - lastActive) / 60000
          if (settings.idleMinutes > 0 && idleMinutes >= settings.idleMinutes) {
            candidates.push({ id: `idle:${group.agentId}`, kind: 'idle', severity: 'warning', agentId: group.agentId, title: `${group.name} 长时间低活动`, message: `CPU 已连续 ${Math.floor(idleMinutes)} 分钟低于 1%，可检查任务是否停滞。` })
          }
        }
      }
    }

    for (const [id, departed] of departedRef.current) {
      if (departed.until < now) {
        departedRef.current.delete(id)
        continue
      }
      candidates.push({ id: `gone:${id}`, kind: 'gone', severity: 'warning', agentId: id, title: `${departed.name} 已退出`, message: '该智能体未再出现在进程扫描结果中；若是异常退出，请检查其日志。' })
    }

    const activeIds = new Set(candidates.map((c) => c.id))
    const next: AlertItem[] = alertsRef.current.map((alert) => alert.active && !activeIds.has(alert.id)
      ? { ...alert, active: false, resolvedAt: now }
      : alert)
    const added: AlertItem[] = []

    for (const candidate of candidates) {
      const existing = next.find((a) => a.id === candidate.id && a.active)
      if (existing) {
        existing.message = candidate.message
        existing.severity = candidate.severity
        continue
      }
      const lastFired = lastFiredRef.current.get(candidate.id) ?? 0
      if (now - lastFired < RECALL_COOLDOWN) continue
      const alert: AlertItem = { ...candidate, ts: now, active: true, acknowledged: false }
      next.unshift(alert)
      added.push(alert)
      lastFiredRef.current.set(candidate.id, now)
    }

    commit(next.slice(0, ALERT_CAP))
    if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
      for (const alert of added) new Notification(alert.title, { body: alert.message, tag: alert.id })
    }
  }, [groups, connected, settings, commit])

  const acknowledge = useCallback((id: string) => {
    commit(alertsRef.current.map((a) => a.id === id ? { ...a, acknowledged: true } : a))
  }, [commit])

  const clearResolved = useCallback(() => {
    commit(alertsRef.current.filter((a) => a.active))
  }, [commit])

  const setNotifications = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      updateSettings({ notifications: false })
      return true
    }
    if (!('Notification' in window)) return false
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    const allowed = permission === 'granted'
    updateSettings({ notifications: allowed })
    return allowed
  }, [updateSettings])

  return {
    alerts,
    activeAlerts: alerts.filter((a) => a.active),
    settings,
    updateSettings,
    acknowledge,
    clearResolved,
    setNotifications,
  }
}
