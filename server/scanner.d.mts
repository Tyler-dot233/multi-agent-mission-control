export interface AgentProcessRow {
  agentId: string
  name: string
  vendor: string
  pid: number
  cpu: number | null
  memMB: number
  etime: string
  command: string
}
export interface ScanOut {
  platform: string
  timestamp: number
  scanned: number
  agents: AgentProcessRow[]
}
export function scanAgents(): Promise<ScanOut>
export function killAgentPid(pid: number): Promise<{ ok: boolean; pid: number; name: string }>
export const SIGNATURES: { id: string; name: string; vendor: string; patterns: RegExp[] }[]
