// 3D 场景事件总线：审批 / 终止 / 新进程出现时，2D 操作 → 3D 视觉反馈
export type SceneEventType = 'approve' | 'kill' | 'appear' | 'alert' | 'focus'
export interface SceneEvent {
  type: SceneEventType
  agentId?: string
  name?: string
}

type Listener = (e: SceneEvent) => void
const listeners = new Set<Listener>()

export function emitSceneEvent(e: SceneEvent) {
  listeners.forEach((f) => f(e))
}

export function onSceneEvent(f: Listener): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
