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
const errors = []
const httpErrors = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails)
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args)
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) httpErrors.push({ status: msg.params.response.status, url: msg.params.response.url })
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
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function shot(name) {
  const result = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true })
  const output = path.join(root, name)
  await writeFile(output, Buffer.from(result.data, 'base64'))
  return output
}

await cdp('Runtime.enable')
await cdp('Network.enable')
await cdp('Page.enable')
await evaluate(`(async()=>{await window.aimonDesktop?.expandMain();location.reload();return true})()`)
await cdp('Page.bringToFront')
await wait(4500)
const initial = await evaluate(`(()=>{const s=window.__aimonStats?.();return {connected:document.body.innerText.includes('已连接'),canvas:!!document.querySelector('canvas'),stats:s,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}}})()`)
if (!initial?.connected || !initial?.canvas) throw new Error(`Initial verification failed: ${JSON.stringify(initial)}`)

await evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('任务'))?.click();return true})()`)
await wait(500)
await evaluate(`(()=>{document.querySelector('[data-slot=dialog-content] summary')?.click();return true})()`)
await wait(150)
const tasks = await evaluate(`(()=>{
  const dialog=document.querySelector('[data-slot=dialog-content]');
  const rect=dialog?.getBoundingClientRect();
  const locate=[...dialog?.querySelectorAll('button')||[]].find(b=>b.textContent.includes('星环定位'));
  const locateRect=locate?.getBoundingClientRect();
  return {title:document.querySelector('[data-slot=dialog-title]')?.textContent,text:dialog?.innerText.slice(0,1500),sessionCount:(dialog?.innerText.match(/个推断会话/)||[]).length,hasProcessTable:!!dialog?.querySelector('tbody tr'),locateButtons:[...dialog?.querySelectorAll('button')||[]].filter(b=>b.textContent.includes('星环定位')).length,layout:{viewport:innerWidth,dialogLeft:rect?.left,dialogRight:rect?.right,locateRight:locateRect?.right,contentOverflow:(dialog?.scrollWidth||0)-(dialog?.clientWidth||0)}};
})()`)
if (tasks?.title !== '任务／会话视角' || !tasks?.hasProcessTable || !tasks?.locateButtons) throw new Error(`Task view failed: ${JSON.stringify({ tasks, errors, httpErrors })}`)
if (tasks.layout.contentOverflow > 1 || tasks.layout.dialogRight > tasks.layout.viewport + 1 || tasks.layout.locateRight > tasks.layout.dialogRight + 1) throw new Error(`Task layout overflow: ${JSON.stringify(tasks.layout)}`)
const taskShot = await shot('feature-tasks.jpg')
await evaluate(`(()=>{const d=document.querySelector('[data-slot=dialog-content]');[...d.querySelectorAll('button')].find(b=>b.textContent.includes('星环定位'))?.click();return true})()`)
let taskClosed = false
for (let attempt = 0; attempt < 32; attempt += 1) {
  taskClosed = await evaluate(`!document.querySelector('[data-slot=dialog-content]')`)
  if (taskClosed) break
  await wait(250)
}
if (!taskClosed) throw new Error('Task locate did not close dialog and return to scene')

const alerts = await evaluate(`(async()=>{
  [...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('告警中心'))?.click();
  await new Promise(r=>setTimeout(r,600));
  const inputs=[...document.querySelectorAll('[data-slot=dialog-content] input[type=number]')];
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  for(const [input,value] of [[inputs[0],'10'],[inputs[1],'256']]){setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  await new Promise(r=>setTimeout(r,700));
  const dialog=document.querySelector('[data-slot=dialog-content]');
  return {title:document.querySelector('[data-slot=dialog-title]')?.textContent,articles:dialog?.querySelectorAll('article').length,text:dialog?.innerText.slice(0,1800),acknowledgeButtons:[...dialog?.querySelectorAll('button')||[]].filter(b=>b.textContent.includes('知晓')).length,locateButtons:[...dialog?.querySelectorAll('button')||[]].filter(b=>b.textContent.includes('定位')).length};
})()`)
if (alerts?.title !== '智能告警中心' || !alerts?.articles || !alerts?.locateButtons) throw new Error(`Alert center failed: ${JSON.stringify(alerts)}`)
const alertShot = await shot('feature-alerts.jpg')
await evaluate(`(()=>{const d=document.querySelector('[data-slot=dialog-content]');[...d.querySelectorAll('button')].find(b=>b.textContent.includes('知晓'))?.click();return true})()`)
await evaluate(`(()=>{const d=document.querySelector('[data-slot=dialog-content]');[...d.querySelectorAll('button')].find(b=>b.textContent.includes('定位'))?.click();return true})()`)
let dialogClosed = false
for (let attempt = 0; attempt < 32; attempt += 1) {
  dialogClosed = await evaluate(`!document.querySelector('[data-slot=dialog-content]')`)
  if (dialogClosed) break
  await wait(250)
}
const final = await evaluate(`(()=>({dialogClosed:!document.querySelector('[data-slot=dialog-content]'),stats:window.__aimonStats?.(),settings:localStorage.getItem('aimon.alerts.settings.v1')}))()`)
if (!dialogClosed || !final?.dialogClosed) throw new Error('Alert locate did not close dialog')
const mainShot = await shot('feature-main.jpg')

await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('aimon.alerts.settings.v1')||'{}');s.cpuPercent=80;s.memoryMB=4096;s.idleMinutes=10;localStorage.setItem('aimon.alerts.settings.v1',JSON.stringify(s));location.reload();return true})()`)
await wait(5000)
const coldStart = await evaluate(`(async()=>{
  [...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('告警中心'))?.click();
  await new Promise(r=>setTimeout(r,300));
  const dialog=document.querySelector('[data-slot=dialog-content]');
  return {connected:document.body.innerText.includes('已连接'),initialOfflineAlert:[...dialog?.querySelectorAll('article h3')||[]].some(h=>h.textContent.includes('监控服务离线')),settings:JSON.parse(localStorage.getItem('aimon.alerts.settings.v1')||'{}')};
})()`)
if (!coldStart?.connected || coldStart?.initialOfflineAlert) throw new Error(`Cold start verification failed: ${JSON.stringify(coldStart)}`)
if (errors.length || httpErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ errors, httpErrors })}`)
console.log(JSON.stringify({ initial, tasks, alerts, final, coldStart, runtimeErrors: errors, httpErrors, screenshots: [taskShot, alertShot, mainShot] }, null, 2))
ws.close()
