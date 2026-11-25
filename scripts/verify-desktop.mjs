import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pages = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json())
const page = pages.find((p) => p.type === 'page' && p.title === '多智能体监控台')
if (!page) throw new Error('Desktop window not found')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (!msg.id || !pending.has(msg.id)) return
  const { resolve, reject } = pending.get(msg.id)
  pending.delete(msg.id)
  if (msg.error) reject(new Error(JSON.stringify(msg.error)))
  else resolve(msg.result)
})

function cdp(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const evaluation = await cdp('Runtime.evaluate', {
  expression: `(async()=>{
    await new Promise(r=>setTimeout(r,3200));
    const scan=await fetch('/api/scan').then(r=>r.json());
    return {
      title:document.title,
      canvas:!!document.querySelector('canvas'),
      connected:document.body.innerText.includes('已连接'),
      agents:scan.agents.length,
      platform:scan.platform,
      stats:window.__aimonStats?.(),
      viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails))
const result = evaluation.result.value
if (!result?.canvas || !result?.connected || !result?.agents) {
  throw new Error(`Desktop verification failed: ${JSON.stringify(result)}`)
}
const view = result.viewport
if (view.scrollWidth > view.width || view.scrollHeight > view.height) {
  throw new Error(`Desktop layout overflow: ${JSON.stringify(view)}`)
}
console.log(JSON.stringify(result, null, 2))

const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
const output = path.join(root, 'desktop-check.jpg')
await writeFile(output, Buffer.from(shot.data, 'base64'))
console.log(output)
ws.close()
