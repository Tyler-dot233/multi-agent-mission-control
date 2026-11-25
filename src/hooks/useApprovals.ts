import { useCallback, useState } from 'react'
import type { Decision, Policy } from '@/types'

const POLICIES_KEY = 'aimon.policies.v1'

function load(): Record<string, Policy> {
  try {
    return JSON.parse(localStorage.getItem(POLICIES_KEY) || '{}')
  } catch {
    return {}
  }
}

/** Allow/deny policies decided by the user in the pre-work confirmation center. */
export function useApprovals() {
  const [policies, setPolicies] = useState<Record<string, Policy>>(load)

  const decide = useCallback((agentId: string, name: string, decision: Decision) => {
    setPolicies((prev) => {
      const next = { ...prev, [agentId]: { agentId, name, decision, decidedAt: Date.now() } }
      try { localStorage.setItem(POLICIES_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  const revoke = useCallback((agentId: string) => {
    setPolicies((prev) => {
      const next = { ...prev }
      delete next[agentId]
      try { localStorage.setItem(POLICIES_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  return { policies, decide, revoke }
}
