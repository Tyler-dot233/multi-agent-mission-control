// Cross-platform AI-agent process scanner (Windows / macOS / Linux).
// Used by both the Vite dev middleware and the standalone production server.
import { execFile } from 'node:child_process'
import os from 'node:os'

// Signature library: keyword patterns matched against process name / path / command line.
export const SIGNATURES = [
  { id: 'kimi',        name: 'Kimi',            vendor: 'Moonshot AI',  patterns: [/kimi\.app/i, /kimi-webbridge/i, /\/Kimi\b/] },
  { id: 'claude',      name: 'Claude / Claude Code', vendor: 'Anthropic', patterns: [/claude/i, /anthropic/i] },
  { id: 'cursor',      name: 'Cursor',          vendor: 'Anysphere',    patterns: [/cursor\.app/i, /\bcursor\b(?!-agent)/i] },
  { id: 'workbuddy',   name: 'WorkBuddy',       vendor: 'WorkBuddy',    patterns: [/workbuddy/i] },
  { id: 'chatgpt',     name: 'ChatGPT',         vendor: 'OpenAI',       patterns: [/chatgpt/i, /openai/i] },
  { id: 'ollama',      name: 'Ollama',          vendor: 'Ollama',       patterns: [/ollama/i] },
  { id: 'lmstudio',    name: 'LM Studio',       vendor: 'LM Studio',    patterns: [/lm[ -]?studio/i] },
  { id: 'doubao',      name: '豆包',             vendor: '字节跳动',      patterns: [/doubao/i] },
  { id: 'qoder',       name: 'Qoder',           vendor: '阿里巴巴',      patterns: [/qoder/i] },
  { id: 'ima',         name: 'ima.copilot',     vendor: '腾讯',          patterns: [/ima\.copilot/i] },
  { id: 'copilot',     name: 'Copilot',         vendor: 'Microsoft/GitHub', patterns: [/copilot/i] },
  { id: 'windsurf',    name: 'Windsurf',        vendor: 'Codeium',      patterns: [/windsurf/i, /codeium/i] },
  { id: 'aider',       name: 'Aider',           vendor: 'open source',  patterns: [/\baider\b/i] },
  { id: 'gemini',      name: 'Gemini',          vendor: 'Google',       patterns: [/gemini/i] },
  { id: 'deepseek',    name: 'DeepSeek',        vendor: 'DeepSeek',     patterns: [/deepseek/i] },
  { id: 'tongyi',      name: '通义',             vendor: '阿里巴巴',      patterns: [/tongyi/i, /qwen/i] },
  { id: 'codex',       name: 'Codex CLI',       vendor: 'OpenAI',       patterns: [/\bcodex\b/i] },
  { id: 'continue',    name: 'Continue',        vendor: 'open source',  patterns: [/\.continue/i] },
  { id: 'dify',        name: 'Dify',            vendor: 'LangGenius',   patterns: [/\bdify\b/i] },
  { id: 'comfyui',     name: 'ComfyUI',         vendor: 'open source',  patterns: [/comfyui/i] },
  { id: 'sdwebui',     name: 'Stable Diffusion WebUI', vendor: 'open source', patterns: [/stable-diffusion-webui/i, /webui\.py/i] },
]

function matchSignature(command) {
  for (const sig of SIGNATURES) {
    if (sig.patterns.some((p) => p.test(command))) return sig
  }
  return null
}

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

async function scanPosix() {
  // pid, parent pid, cpu%, rss(KB), elapsed, full command
  const out = await run('ps', ['-axo', 'pid=,ppid=,pcpu=,rss=,etime=,command='])
  const rows = []
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (!m) continue
    const [, pid, ppid, cpu, rss, etime, command] = m
    // skip our own scanner invocation
    if (/ps -axo/.test(command)) continue
    rows.push({
      pid: Number(pid),
      ppid: Number(ppid),
      cpu: Number(cpu),
      memMB: Math.round(Number(rss) / 1024),
      etime,
      command,
    })
  }
  return rows
}

async function scanWindows() {
  const ps = [
    'Get-Process | Where-Object {$_.Path -ne $null} |',
    'Select-Object Id,ProcessName,CPU,WorkingSet64,Path |',
    'ConvertTo-Json -Compress -Depth 2',
  ].join(' ')
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 15000)
  let data = JSON.parse(out || '[]')
  if (!Array.isArray(data)) data = [data]
  return data.map((p) => ({
    pid: p.Id,
    ppid: 0, // Windows 回退为按智能体聚合会话，避免高频查询 CIM 造成额外负载
    cpu: null, // Windows instant CPU% requires sampling; shown as '—'
    cpuSeconds: p.CPU ?? 0,
    memMB: Math.round((p.WorkingSet64 || 0) / 1024 / 1024),
    etime: '',
    command: `${p.ProcessName} ${p.Path || ''}`,
  }))
}

/** Scan the machine, return { platform, timestamp, scanned, agents[] } */
export async function scanAgents() {
  const platform = os.platform()
  const rows = platform === 'win32' ? await scanWindows() : await scanPosix()

  const agents = []
  const seen = new Set()
  for (const row of rows) {
    const sig = matchSignature(row.command)
    if (!sig) continue
    agents.push({
      agentId: sig.id,
      name: sig.name,
      vendor: sig.vendor,
      pid: row.pid,
      ppid: row.ppid ?? 0,
      cpu: row.cpu,
      memMB: row.memMB,
      etime: row.etime,
      command: row.command.slice(0, 500),
    })
    seen.add(sig.id)
  }
  agents.sort((a, b) => (b.memMB || 0) - (a.memMB || 0))
  return { platform, timestamp: Date.now(), scanned: rows.length, agents }
}

/** Kill a pid, but ONLY if it currently matches an AI signature (safety guard). */
export async function killAgentPid(pid) {
  const num = Number(pid)
  if (!Number.isInteger(num) || num <= 0) throw new Error('invalid pid')
  const { agents } = await scanAgents()
  const target = agents.find((a) => a.pid === num)
  if (!target) throw new Error(`pid ${num} 不在受监控的 AI 进程列表中，已拒绝操作`)
  process.kill(num, 'SIGTERM')
  return { ok: true, pid: num, name: target.name }
}
