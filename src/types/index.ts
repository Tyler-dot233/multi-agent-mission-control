export interface AgentProcess {
  agentId: string
  name: string
  vendor: string
  pid: number
  ppid: number
  cpu: number | null
  memMB: number
  etime: string
  command: string
}

export interface ScanResult {
  platform: string
  timestamp: number
  scanned: number
  agents: AgentProcess[]
}

export interface AgentGroup {
  agentId: string
  name: string
  vendor: string
  processes: AgentProcess[]
  cpu: number | null
  memMB: number
}

export type Decision = 'allowed' | 'denied'

export interface Policy {
  agentId: string
  name: string
  decision: Decision
  decidedAt: number
}

export type EventKind = 'appeared' | 'gone' | 'approved' | 'denied' | 'killed' | 'error' | 'info'

export interface MonitorEvent {
  id: string
  ts: number
  kind: EventKind
  message: string
}

export interface HistoryPoint {
  ts: number
  cpu: number
  memMB: number
}

export interface TaskSession {
  id: string
  agentId: string
  agentName: string
  rootPid: number
  title: string
  stage: string
  processes: AgentProcess[]
  cpu: number | null
  memMB: number
  startedAt: number | null
  inferred: boolean
}

export type AlertKind = 'cpu' | 'memory' | 'idle' | 'offline' | 'gone'
export type AlertSeverity = 'warning' | 'critical'

export interface AlertItem {
  id: string
  kind: AlertKind
  severity: AlertSeverity
  agentId?: string
  title: string
  message: string
  ts: number
  active: boolean
  acknowledged: boolean
  resolvedAt?: number
}

export interface AlertSettings {
  cpuPercent: number
  memoryMB: number
  idleMinutes: number
  offline: boolean
  notifications: boolean
}

/** 3D 场景的视觉事件（审批/终止/跃迁等操作的画面反馈） */
export interface FxEvent {
  type: 'approve' | 'deny' | 'kill'
  agentId: string
}
