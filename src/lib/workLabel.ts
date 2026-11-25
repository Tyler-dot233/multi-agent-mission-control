import type { AgentProcess } from '@/types'

/**
 * 从进程命令行推断工作类型，返回规范的中文术语。
 * 规则自上而下匹配，命中即返回。
 */
export function describeWork(p: AgentProcess): string {
  const c = (p.command || '').toLowerCase()
  if (/--type=renderer/.test(c)) return '界面渲染'
  if (/--type=gpu-process/.test(c)) return 'GPU 图形加速'
  if (/--type=utility/.test(c)) return '后台服务'
  if (/--type=(broker|crashpad)/.test(c)) return '进程守护'
  if (/python|\.py(\s|$)/.test(c)) return 'Python 任务'
  if (/vite|esbuild|webpack|rollup|\btsc\b/.test(c)) return '代码构建'
  if (/ollama|llama|inference|\bmlx\b|torch|transformers/.test(c)) return '模型推理'
  if (/\bnode\b.*\b(serve|server)\b/.test(c)) return '本地服务'
  if (/\b(agent|mcp)[\s.-]/.test(c)) return '智能体调度'
  if (/helper/i.test(c)) return '辅助进程'
  return '主进程驻留'
}

export interface WorkSummary {
  label: string
  count: number
  /** 该类型进程的 CPU 合计；平台不支持采样时为 null */
  cpu: number | null
}

/** 将一个智能体的全部进程按工作类型聚合，按负载降序排列 */
export function summarizeWork(g: { processes: AgentProcess[] }, limit = 4): WorkSummary[] {
  const map = new Map<string, WorkSummary>()
  let sawCpu = false
  for (const p of g.processes) {
    const label = describeWork(p)
    const cur = map.get(label) ?? { label, count: 0, cpu: 0 }
    cur.count += 1
    if (p.cpu != null) {
      cur.cpu = (cur.cpu ?? 0) + p.cpu
      sawCpu = true
    }
    map.set(label, cur)
  }
  const all = [...map.values()]
  if (!sawCpu) all.forEach((w) => (w.cpu = null))
  all.sort((a, b) => (b.cpu ?? b.count) - (a.cpu ?? a.count))
  return all.slice(0, limit)
}
