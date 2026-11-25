import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []
const httpErrors = []
let requestCount = 0
const pages = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
const page = pages.find((item) => item.type === 'page' && !item.url.includes('mini=1'))
if (!page) throw new Error('Main desktop window not found')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails)
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args)
  if (msg.method === 'Network.requestWillBeSent') requestCount += 1
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) httpErrors.push({ status: msg.params.response.status, url: msg.params.response.url })
  if (!msg.id || !pending.has(msg.id)) return
  const { resolve, reject } = pending.get(msg.id)
  pending.delete(msg.id)
  if (msg.error) reject(new Error(JSON.stringify(msg.error)))
  else resolve(msg.result)
})
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error(`CDP timeout: ${method}`))
  }, 20000)
  pending.set(id, {
    resolve: (value) => { clearTimeout(timer); resolve(value) },
    reject: (error) => { clearTimeout(timer); reject(error) },
  })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const stats = () => evaluate(`(()=>{const s=window.__aimonStats?.();const c=document.querySelector('canvas');return {...s,cssWidth:c?.clientWidth,cssHeight:c?.clientHeight,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},devicePixelRatio}})()`)
const openSettings = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const opened = await evaluate(`(()=>{const panel=document.querySelector('[aria-label="页面设置面板"]');if(panel?.dataset.state==='open'&&panel.querySelector('button[aria-label="画质高清"]'))return true;if(!panel)document.querySelector('button[aria-label="页面设置"]')?.click();return false})()`)
    if (opened) return true
    await wait(200)
  }
  throw new Error('Page settings did not reach open state')
}
const setQuality = async (label) => {
  await openSettings()
  return evaluate(`(async()=>{const button=document.querySelector('button[aria-label="画质${label}"]');if(!button)throw new Error('Quality button not found: ${label}');button.click();await new Promise(r=>setTimeout(r,500));return {pressed:document.querySelector('button[aria-label="画质${label}"]')?.getAttribute('aria-pressed'),stored:localStorage.getItem('aimon.display.render-quality.v1')}})()`)
}
const shot = async (name) => {
  const result = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const output = path.join(root, name)
  await writeFile(output, Buffer.from(result.data, 'base64'))
  return output
}

await cdp('Runtime.enable')
await cdp('Network.enable')
await cdp('Page.enable')
await evaluate(`(async()=>{await window.aimonDesktop?.expandMain();localStorage.setItem('aimon.display.render-quality.v1','ultra');localStorage.setItem('aimon.camera-cruise-speed.v1','0');location.reload();return true})()`)
await cdp('Page.bringToFront')
await wait(7000)
const ultra = await stats()
if (ultra?.renderQuality !== 'ultra' || ultra.sharpening !== 0.24 || ultra.starCount !== 720 || ultra.antiAliasing !== 'SMAA' || ultra.pixelRatio < 1.5 || ultra.bufferWidth < ultra.cssWidth * 1.49 || !ultra.fps) throw new Error(`Ultra render verification failed: ${JSON.stringify(ultra)}`)
if (ultra.viewport.scrollWidth > ultra.viewport.width) throw new Error(`Horizontal overflow: ${JSON.stringify(ultra.viewport)}`)
const ultraShot = await shot('quality-ultra.png')
if (!await openSettings()) throw new Error('Page settings did not open')
const settingsShot = await shot('quality-settings.png')

const highInput = await setQuality('高清')
await wait(2500)
const high = await stats()
if (highInput?.pressed !== 'true' || highInput.stored !== 'high' || high?.renderQuality !== 'high' || high.pixelRatio > 2 || high.sharpening !== 0.18) throw new Error(`High quality switch failed: ${JSON.stringify({ highInput, high })}`)

const balancedInput = await setQuality('流畅')
await wait(2500)
const balanced = await stats()
if (balancedInput?.pressed !== 'true' || balancedInput.stored !== 'balanced' || balanced?.renderQuality !== 'balanced' || balanced.pixelRatio > 1.25 || balanced.sharpening !== 0.12) throw new Error(`Balanced quality switch failed: ${JSON.stringify({ balancedInput, balanced })}`)

await setQuality('高清')
await evaluate('location.reload(); true')
await wait(5000)
const remembered = await stats()
if (remembered?.renderQuality !== 'high' || remembered.sharpening !== 0.18) throw new Error(`Quality persistence failed: ${JSON.stringify(remembered)}`)
await openSettings()
await setQuality('极致')
await wait(1800)
const restored = await stats()
if (restored?.renderQuality !== 'ultra') throw new Error(`Ultra restore failed: ${JSON.stringify(restored)}`)
if (errors.length || httpErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ errors, httpErrors })}`)
console.log(JSON.stringify({ ultra, high, balanced, remembered, restored, requestCount, runtimeErrors: errors, httpErrors, screenshots: [ultraShot, settingsShot] }, null, 2))
ws.close()
