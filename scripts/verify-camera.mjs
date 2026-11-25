import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []
const httpErrors = []
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
  }, 10000)
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
const stats = () => evaluate('window.__aimonStats?.()')
const openSettings = () => evaluate(`(async()=>{
  if(!document.querySelector('[aria-label="页面设置面板"]')) document.querySelector('button[aria-label="页面设置"]')?.click();
  await new Promise(r=>setTimeout(r,180));
  return !!document.querySelector('[aria-label="页面设置面板"]');
})()`)
const setSpeed = (value) => evaluate(`(async()=>{
  if(!document.querySelector('[aria-label="页面设置面板"]')) document.querySelector('button[aria-label="页面设置"]')?.click();
  await new Promise(r=>setTimeout(r,180));
  const slider=document.querySelector('[role="slider"][aria-label="镜头巡航转速"]');
  slider?.dispatchEvent(new KeyboardEvent('keydown',{key:'${value === 0 ? 'Home' : 'End'}',bubbles:true}));
  await new Promise(r=>setTimeout(r,120));
  return slider?.getAttribute('aria-valuenow');
})()`)
const cameraDelta = (before, after) => Math.sqrt(before.cameraPosition.reduce((sum, value, index) => sum + Math.pow(after.cameraPosition[index] - value, 2), 0))

await cdp('Runtime.enable')
await cdp('Network.enable')
await cdp('Page.enable')
await evaluate(`(async()=>{await window.aimonDesktop?.expandMain();localStorage.setItem('aimon.camera-cruise-speed.v1','1');localStorage.setItem('aimon.display.font-size.v1','112');location.reload();return true})()`)
await cdp('Page.bringToFront')
let before
for (let attempt = 0; attempt < 24; attempt += 1) {
  await wait(500)
  before = await stats()
  if (before?.agents > 0 && before.cameraAutoRotate) break
}
await wait(900)
const after = await stats()
const normalDelta = cameraDelta(before, after)
if (!before || before.cameraSpeed !== 1 || !before.cameraAutoRotate || before.cameraAutoRotateSpeed !== 0.45 || !(normalDelta > 0.01)) throw new Error(`Normal camera cruise failed: ${JSON.stringify({ before, after, normalDelta })}`)

const zeroInput = await setSpeed(0)
await wait(700)
const paused = await stats()
if (zeroInput !== '0' || paused?.cameraSpeed !== 0 || paused.cameraAutoRotate || paused.cameraAutoRotateSpeed !== 0) throw new Error(`Camera pause failed: ${JSON.stringify({ zeroInput, paused })}`)

const fastInput = await setSpeed(2)
await wait(150)
const fastBefore = await stats()
await wait(900)
const fastAfter = await stats()
const fastDelta = cameraDelta(fastBefore, fastAfter)
if (fastInput !== '2' || fastBefore?.cameraSpeed !== 2 || !fastBefore.cameraAutoRotate || fastBefore.cameraAutoRotateSpeed !== 0.9 || !(fastDelta > normalDelta * 1.5)) throw new Error(`Camera acceleration failed: ${JSON.stringify({ fastBefore, fastAfter, normalDelta, fastDelta })}`)

const screenshot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true })
const screenshotPath = path.join(root, 'page-settings-screen.jpg')
await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

await evaluate('location.reload(); true')
await wait(4000)
await openSettings()
const remembered = await evaluate(`(()=>({input:document.querySelector('[role="slider"][aria-label="镜头巡航转速"]')?.getAttribute('aria-valuenow'),stored:localStorage.getItem('aimon.camera-cruise-speed.v1'),stats:window.__aimonStats?.()}))()`)
if (remembered?.input !== '2' || remembered.stored !== '2' || remembered.stats?.cameraSpeed !== 2) throw new Error(`Camera speed persistence failed: ${JSON.stringify(remembered)}`)

await evaluate(`(()=>{document.querySelector('[role="slider"][aria-label="界面字体大小"]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return true})()`)
await wait(350)
const largeFont = await evaluate(`(()=>({input:document.querySelector('[role="slider"][aria-label="界面字体大小"]')?.getAttribute('aria-valuenow'),root:document.documentElement.style.fontSize,stored:localStorage.getItem('aimon.display.font-size.v1'),overflow:document.documentElement.scrollWidth>innerWidth}))()`)
if (largeFont?.input !== '140' || largeFont.root !== '140%' || largeFont.stored !== '140' || largeFont.overflow) throw new Error(`Font size setting failed: ${JSON.stringify(largeFont)}`)

await evaluate(`(()=>{[...document.querySelectorAll('[aria-label="页面设置面板"] button')].find(button=>button.textContent.includes('恢复默认'))?.click();return true})()`)
await wait(400)
const reset = await evaluate(`(()=>({cruise:document.querySelector('[role="slider"][aria-label="镜头巡航转速"]')?.getAttribute('aria-valuenow'),font:document.querySelector('[role="slider"][aria-label="界面字体大小"]')?.getAttribute('aria-valuenow'),volume:document.querySelector('[role="slider"][aria-label="背景音量"]')?.getAttribute('aria-valuenow'),root:document.documentElement.style.fontSize,cruiseStored:localStorage.getItem('aimon.camera-cruise-speed.v1'),fontStored:localStorage.getItem('aimon.display.font-size.v1'),volumeStored:localStorage.getItem('aimon.space-ambience-volume.v1')}))()`)
if (reset?.cruise !== '1' || reset.font !== '112' || reset.volume !== '32' || reset.root !== '112%' || reset.cruiseStored !== '1' || reset.fontStored !== '112' || reset.volumeStored !== '32') throw new Error(`Settings reset failed: ${JSON.stringify(reset)}`)

if (errors.length || httpErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ errors, httpErrors })}`)
console.log(JSON.stringify({ normalDelta, fastDelta, paused, camera: { normal: before.cameraAutoRotateSpeed, paused: paused.cameraAutoRotateSpeed, fast: fastBefore.cameraAutoRotateSpeed }, remembered, largeFont, reset, runtimeErrors: errors, httpErrors, screenshot: screenshotPath }, null, 2))
ws.close()
