import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []
const httpErrors = []

async function pages() {
  return fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
}

async function connectSocket(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
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
      reject(new Error(`CDP timeout: ${method} ${JSON.stringify(params).slice(0, 240)}`))
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
  return { ws, cdp, evaluate }
}

async function connect(page) {
  const connection = await connectSocket(page.webSocketDebuggerUrl)
  await connection.cdp('Runtime.enable')
  await connection.cdp('Network.enable')
  return connection
}

async function shot(cdp, name) {
  const result = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true })
  const output = path.join(root, name)
  await writeFile(output, Buffer.from(result.data, 'base64'))
  return output
}

const windowBounds = (target, value) => target.evaluate(`window.aimonDesktop.setMiniScale(${value})`)

const openSettings = (target) => target.evaluate(`(async()=>{
  const button=document.querySelector('button[aria-label="悬浮窗显示设置"]');
  if(button?.getAttribute('aria-expanded')!=='true') button?.click();
  await new Promise(r=>setTimeout(r,180));
  return button?.getAttribute('aria-expanded');
})()`)

async function setScale(target, value) {
  const result = await target.evaluate(`(async()=>{
    const input=document.querySelector('input[aria-label="悬浮窗缩放"]');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,'${value}');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,320));
    return {input:input?.value,stored:localStorage.getItem('aimon.mini.window-scale.v1'),output:document.querySelector('.mini-settings-heading output')?.textContent,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}};
  })()`)
  return { ...result, bounds: await windowBounds(target, value) }
}

const all = await pages()
const mainPage = all.find((page) => page.type === 'page' && !page.url.includes('mini=1') && page.url.startsWith('http://127.0.0.1:'))
if (!mainPage) throw new Error('Main desktop window not found')
const main = await connect(mainPage)
await main.evaluate(`(()=>{localStorage.setItem('aimon.mini.window-scale.v1','1');localStorage.setItem('aimon.mini.position-locked.v1','false');location.reload();return true})()`)
await wait(4000)
await main.evaluate(`(()=>{document.querySelector('button[aria-label="打开迷你悬浮窗"]')?.click();return true})()`)
await wait(1800)

const miniPage = (await pages()).find((page) => page.type === 'page' && page.url.includes('mini=1'))
if (!miniPage) throw new Error('Mini window was not created')
const mini = await connect(miniPage)
await mini.evaluate(`(async()=>{localStorage.setItem('aimon.mini.window-scale.v1','1');localStorage.setItem('aimon.mini.position-locked.v1','false');await window.aimonDesktop?.setMiniScale(1);location.reload();return true})()`)
await wait(1800)
await mini.evaluate(`window.aimonDesktop.setMiniAgentCount(4)`)
await wait(250)
const contentShot = await shot(mini.cdp, 'mini-content-enlarged.jpg')
const contentFits = await mini.evaluate(`(()=>{const content=document.querySelector('.mini-content');const header=document.querySelector('.mini-header');return content.scrollWidth<=content.clientWidth&&header.scrollWidth<=header.clientWidth})()`)
if (!contentFits) throw new Error('Enlarged mini content overflows its container')
const settingsExpanded = await openSettings(mini)
const initial = await mini.evaluate(`(()=>{
  const scale=document.querySelector('input[aria-label="悬浮窗缩放"]');
  const panel=document.querySelector('.mini-settings');
  const rect=panel.getBoundingClientRect();
  return {bridge:typeof window.aimonDesktop?.setMiniScale==='function',agents:document.querySelectorAll('.mini-agent').length,scale:scale?.value,step:scale?.step,presets:document.querySelectorAll('.mini-scale-presets').length,sliderFocused:document.activeElement===scale,panelFits:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,panelOverflow:panel.scrollHeight>panel.clientHeight,locked:document.querySelector('button[aria-label="固定到桌面"]')?.getAttribute('aria-pressed'),drag:getComputedStyle(document.querySelector('.mini-drag-region')).webkitAppRegion,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}};
})()`)
if (settingsExpanded !== 'true' || !initial?.bridge || !initial?.agents || initial.scale !== '1' || initial.step !== '0.01' || initial.presets !== 0 || !initial.sliderFocused || !initial.panelFits || initial.panelOverflow || initial.locked !== 'false' || initial.drag !== 'drag' || initial.viewport.scrollWidth !== initial.viewport.width) throw new Error(`Mini initial verification failed: ${JSON.stringify({ settingsExpanded, initial })}`)

await mini.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
await mini.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
await wait(320)
const fine = await mini.evaluate(`(()=>({scale:document.querySelector('input[aria-label="悬浮窗缩放"]')?.value,stored:localStorage.getItem('aimon.mini.window-scale.v1'),output:document.querySelector('.mini-settings-heading output')?.textContent}))()`)
fine.bounds = await windowBounds(mini, 1.01)
if (fine?.scale !== '1.01' || fine.stored !== '1.01' || fine.output !== '101%' || fine.bounds?.width !== 848 || fine.bounds?.height !== 263) throw new Error(`Mini 1% fine adjustment failed: ${JSON.stringify(fine)}`)
await mini.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 })
await mini.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 })
await wait(320)

const small = await setScale(mini, 0.75)
if (small?.input !== '0.75' || small.stored !== '0.75' || small.output !== '75%' || small.bounds?.width !== 630 || small.bounds?.height !== 195 || small.viewport.scrollWidth !== small.viewport.width) throw new Error(`Mini shrink failed: ${JSON.stringify(small)}`)
const smallShot = await shot(mini.cdp, 'mini-settings-small.jpg')
const dense85 = await setScale(mini, 0.85)
if (dense85?.input !== '0.85' || dense85.stored !== '0.85' || dense85.output !== '85%' || dense85.bounds?.width !== 714 || dense85.bounds?.height !== 221) throw new Error(`Mini 85% scale failed: ${JSON.stringify(dense85)}`)
const large = await setScale(mini, 1.5)
if (large?.input !== '1.5' || large.stored !== '1.5' || large.output !== '150%' || large.bounds?.width !== 1260 || large.bounds?.height !== 390 || large.viewport.scrollWidth !== large.viewport.width) throw new Error(`Mini enlargement failed: ${JSON.stringify(large)}`)
const dense110 = await setScale(mini, 1.1)
if (dense110?.input !== '1.1' || dense110.stored !== '1.1' || dense110.output !== '110%' || dense110.bounds?.width !== 924 || dense110.bounds?.height !== 286) throw new Error(`Mini 110% scale failed: ${JSON.stringify(dense110)}`)
const preferred = await setScale(mini, 1.25)
if (preferred?.bounds?.width !== 1050 || preferred.bounds?.height !== 325) throw new Error(`Mini intermediate scale failed: ${JSON.stringify(preferred)}`)
await mini.evaluate(`(async()=>{
  const input=document.querySelector('input[aria-label="悬浮窗缩放"]');
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  const set=value=>{setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
  set('0.9');await new Promise(r=>setTimeout(r,45));set('1.5');await new Promise(r=>setTimeout(r,45));set('1.25');
})()`)
await wait(320)
const rapid = { bounds: await windowBounds(mini, 1.25), stored: await mini.evaluate(`localStorage.getItem('aimon.mini.window-scale.v1')`) }
if (rapid.bounds?.width !== 1050 || rapid.bounds?.height !== 325 || rapid.stored !== '1.25') throw new Error(`Mini rapid scale switching failed: ${JSON.stringify(rapid)}`)

await mini.evaluate(`(()=>{const button=document.querySelector('button[aria-label="悬浮窗显示设置"]');if(button?.getAttribute('aria-expanded')==='true')button.click();return true})()`)
await wait(180)
const adaptive = []
let narrowShot
let wideShot
for (const [count, width] of [[1, 813], [2, 900], [3, 975], [4, 1050]]) {
  const bounds = await mini.evaluate(`window.aimonDesktop.setMiniAgentCount(${count})`)
  const layout = await mini.evaluate(`(()=>{const content=document.querySelector('.mini-content');const header=document.querySelector('.mini-header');const agents=document.querySelector('.mini-agents');return {contentFits:content.scrollWidth<=content.clientWidth,headerFits:header.scrollWidth<=header.clientWidth,agentsFit:agents.scrollWidth<=agents.clientWidth,viewportFits:document.documentElement.scrollWidth===innerWidth}})()`)
  adaptive.push({ count, bounds, layout })
  if (bounds?.width !== width || bounds?.height !== 325 || !Object.values(layout).every(Boolean)) throw new Error(`Mini adaptive width failed: ${JSON.stringify(adaptive.at(-1))}`)
  if (count === 1) narrowShot = await shot(mini.cdp, 'mini-adaptive-narrow.jpg')
  if (count === 4) wideShot = await shot(mini.cdp, 'mini-adaptive-wide.jpg')
}
await openSettings(mini)

const lock = await mini.evaluate(`(async()=>{
  document.querySelector('button[aria-label="固定到桌面"]')?.click();
  await new Promise(r=>setTimeout(r,150));
  return {pressed:document.querySelector('button[aria-label="解除桌面位置锁定"]')?.getAttribute('aria-pressed'),stored:localStorage.getItem('aimon.mini.position-locked.v1'),drag:getComputedStyle(document.querySelector('.mini-drag-region')).webkitAppRegion,coreDrag:getComputedStyle(document.querySelector('.mini-core-zone')).webkitAppRegion};
})()`)
if (lock?.pressed !== 'true' || lock.stored !== 'true' || lock.drag !== 'no-drag' || lock.coreDrag !== 'no-drag') throw new Error(`Mini position lock failed: ${JSON.stringify(lock)}`)
const miniShot = await shot(mini.cdp, 'mini-scale-locked.jpg')

const pin = await mini.evaluate(`(async()=>{
  const button=document.querySelector('button[aria-label="取消置顶"]');button?.click();
  await new Promise(r=>setTimeout(r,100));
  const off=document.querySelector('button[aria-label="设为置顶"]')?.getAttribute('aria-pressed');
  document.querySelector('button[aria-label="设为置顶"]')?.click();
  await new Promise(r=>setTimeout(r,100));
  return {off,on:document.querySelector('button[aria-label="取消置顶"]')?.getAttribute('aria-pressed')};
})()`)
if (pin?.off !== 'false' || pin?.on !== 'true') throw new Error(`Always-on-top toggle failed: ${JSON.stringify(pin)}`)

await mini.evaluate(`(()=>{setTimeout(()=>document.querySelector('button[aria-label^="打开告警中心"]')?.click(),0);return true})()`)
await wait(1200)
const alertState = await main.evaluate(`(()=>({title:document.querySelector('[data-slot=dialog-title]')?.textContent,dialog:!!document.querySelector('[data-slot=dialog-content]')}))()`)
const miniClosedForAlerts = !(await pages()).some((page) => page.url.includes('mini=1'))
if (!miniClosedForAlerts || alertState?.title !== '智能告警中心') throw new Error(`Alert handoff failed: ${JSON.stringify({ alertState, miniClosedForAlerts })}`)

await main.evaluate('location.reload(); true')
await wait(3000)
await main.evaluate(`(()=>{document.querySelector('button[aria-label="打开迷你悬浮窗"]')?.click();return true})()`)
await wait(1500)
const reopenedPage = (await pages()).find((page) => page.url.includes('mini=1'))
if (!reopenedPage) throw new Error('Mini window did not reopen')
const reopened = await connect(reopenedPage)
const reopenedSettingsExpanded = await openSettings(reopened)
const remembered = await reopened.evaluate(`(()=>({scale:document.querySelector('input[aria-label="悬浮窗缩放"]')?.value,storedScale:localStorage.getItem('aimon.mini.window-scale.v1'),locked:document.querySelector('button[aria-label="解除桌面位置锁定"]')?.getAttribute('aria-pressed'),storedLock:localStorage.getItem('aimon.mini.position-locked.v1'),drag:getComputedStyle(document.querySelector('.mini-drag-region')).webkitAppRegion}))()`)
if (reopenedSettingsExpanded !== 'true' || remembered?.scale !== '1.25' || remembered.storedScale !== '1.25' || remembered.locked !== 'true' || remembered.storedLock !== 'true' || remembered.drag !== 'no-drag') throw new Error(`Mini settings were not remembered: ${JSON.stringify({ reopenedSettingsExpanded, remembered })}`)
await reopened.evaluate(`(()=>{setTimeout(()=>document.querySelector('button[aria-label="展开主监控台"]')?.click(),0);return true})()`)
await wait(900)
const expanded = !(await pages()).some((page) => page.url.includes('mini=1'))
if (!expanded) throw new Error('Expand control did not close mini window')

await main.evaluate(`(async()=>{localStorage.setItem('aimon.mini.window-scale.v1','1');localStorage.setItem('aimon.mini.position-locked.v1','false');await window.aimonDesktop?.setMiniScale(1);return true})()`)
if (errors.length || httpErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ errors, httpErrors })}`)
console.log(JSON.stringify({ initial, fine, small, dense85, large, dense110, preferred, rapid, adaptive, lock, pin, alertState, remembered, expanded, runtimeErrors: errors, httpErrors, screenshots: [contentShot, smallShot, narrowShot, wideShot, miniShot] }, null, 2))
main.ws.close()
mini.ws.close()
reopened.ws.close()
