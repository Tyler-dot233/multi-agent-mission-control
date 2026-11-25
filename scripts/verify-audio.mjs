import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []
const httpErrors = []

async function getPage() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const pages = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
      const page = pages.find((item) => item.type === 'page' && !item.url.includes('mini=1'))
      if (page) return page
    } catch {
      // 桌面窗口仍在启动。
    }
    await wait(300)
  }
  throw new Error('Desktop page not found')
}

const page = await getPage()
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
const openSettings = () => evaluate(`(async()=>{
  if(!document.querySelector('[aria-label="页面设置面板"]')) document.querySelector('button[aria-label="页面设置"]')?.click();
  await new Promise(r=>setTimeout(r,180));
  return !!document.querySelector('[aria-label="页面设置面板"]');
})()`)
const shot = async (name) => {
  const result = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
  const output = path.join(root, name)
  await writeFile(output, Buffer.from(result.data, 'base64'))
  return output
}

await cdp('Runtime.enable')
await cdp('Network.enable')
await cdp('Page.enable')
await evaluate(`(async()=>{await window.aimonDesktop?.expandMain();localStorage.removeItem('aimon.space-ambience-volume.v1');return true})()`)
await cdp('Page.bringToFront')
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const NativeAudioContext = window.AudioContext;
    window.__aimonAudioTest = { contexts: [] };
    window.AudioContext = new Proxy(NativeAudioContext, {
      construct(Target, args) {
        const context = new Target(...args);
        context.__testGains = [];
        context.__testOscillators = 0;
        const createGain = context.createGain.bind(context);
        context.createGain = (...gainArgs) => {
          const node = createGain(...gainArgs);
          context.__testGains.push(node);
          return node;
        };
        const createOscillator = context.createOscillator.bind(context);
        context.createOscillator = (...oscArgs) => {
          context.__testOscillators += 1;
          return createOscillator(...oscArgs);
        };
        window.__aimonAudioTest.contexts.push(context);
        return context;
      }
    });
  })();`,
})
await evaluate('location.reload(); true')
await wait(4000)
await openSettings()

const initial = await evaluate(`(()=>{
  const button=document.querySelector('button[aria-label="开启太空寂静背景音乐"]');
  const slider=document.querySelector('[role="slider"][aria-label="背景音量"]');
  return {button:!!button,pressed:button?.getAttribute('aria-pressed'),volume:slider?.getAttribute('aria-valuenow'),contexts:window.__aimonAudioTest.contexts.length,overflow:document.documentElement.scrollWidth>innerWidth};
})()`)
if (!initial?.button || initial.pressed !== 'false' || initial.volume !== '32' || initial.contexts !== 0 || initial.overflow) throw new Error(`Initial audio state failed: ${JSON.stringify(initial)}`)

await evaluate(`document.querySelector('button[aria-label="开启太空寂静背景音乐"]').click(); true`)
await wait(2300)
const playing = await evaluate(`(()=>{
  const context=window.__aimonAudioTest.contexts[0];
  return {pressed:document.querySelector('button[aria-label="关闭太空寂静背景音乐"]')?.getAttribute('aria-pressed'),panel:!!document.querySelector('[aria-label="页面设置面板"]'),labels:[...document.querySelectorAll('[aria-label="页面设置面板"] button')].map(button=>button.getAttribute('aria-label')||button.textContent),state:context?.state,contexts:window.__aimonAudioTest.contexts.length,oscillators:context?.__testOscillators,masterGain:context?.__testGains[0]?.gain.value};
})()`)
if (playing?.pressed !== 'true' || playing.state !== 'running' || playing.contexts !== 1 || playing.oscillators !== 15 || !(playing.masterGain > 0.06)) throw new Error(`Audio start failed: ${JSON.stringify(playing)}`)
const mainShot = await shot('audio-settings-screen.jpg')

await evaluate(`(()=>{
  const slider=document.querySelector('[role="slider"][aria-label="背景音量"]');
  slider.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
  return true;
})()`)
await wait(700)
const volume = await evaluate(`(()=>{
  const context=window.__aimonAudioTest.contexts[0];
  return {value:document.querySelector('[role="slider"][aria-label="背景音量"]')?.getAttribute('aria-valuenow'),stored:localStorage.getItem('aimon.space-ambience-volume.v1'),masterGain:context?.__testGains[0]?.gain.value};
})()`)
if (volume?.value !== '100' || volume.stored !== '100' || !(volume.masterGain > 0.19)) throw new Error(`Volume change failed: ${JSON.stringify(volume)}`)

await evaluate(`(()=>{
  const buttons=[...document.querySelectorAll('button')];
  buttons.find((button)=>button.textContent.includes('经典视图'))?.click();
  return true;
})()`)
await wait(700)
await openSettings()
const classic = await evaluate(`(()=>{
  const context=window.__aimonAudioTest.contexts[0];
  return {button:!!document.querySelector('button[aria-label="关闭太空寂静背景音乐"]'),pressed:document.querySelector('button[aria-label="关闭太空寂静背景音乐"]')?.getAttribute('aria-pressed'),state:context?.state,contexts:window.__aimonAudioTest.contexts.length};
})()`)
if (!classic?.button || classic.pressed !== 'true' || classic.state !== 'running' || classic.contexts !== 1) throw new Error(`View handoff failed: ${JSON.stringify(classic)}`)
const classicShot = await shot('audio-classic-settings.jpg')

await evaluate(`document.querySelector('button[aria-label="关闭太空寂静背景音乐"]').click(); true`)
await wait(1200)
const stopped = await evaluate(`(()=>{
  const context=window.__aimonAudioTest.contexts[0];
  return {pressed:document.querySelector('button[aria-label="开启太空寂静背景音乐"]')?.getAttribute('aria-pressed'),state:context?.state,masterGain:context?.__testGains[0]?.gain.value};
})()`)
if (stopped?.pressed !== 'false' || stopped.state !== 'suspended' || stopped.masterGain !== 0) throw new Error(`Audio stop failed: ${JSON.stringify(stopped)}`)

await evaluate('location.reload(); true')
await wait(3500)
await openSettings()
const remembered = await evaluate(`(()=>({volume:document.querySelector('[role="slider"][aria-label="背景音量"]')?.getAttribute('aria-valuenow'),pressed:document.querySelector('button[aria-label="开启太空寂静背景音乐"]')?.getAttribute('aria-pressed'),contexts:window.__aimonAudioTest.contexts.length}))()`)
if (remembered?.volume !== '100' || remembered.pressed !== 'false' || remembered.contexts !== 0) throw new Error(`Volume persistence failed: ${JSON.stringify(remembered)}`)

await evaluate(`localStorage.setItem('aimon.space-ambience-volume.v1','32'); location.reload(); true`)
await wait(2500)
if (errors.length || httpErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ errors, httpErrors })}`)
console.log(JSON.stringify({ initial, playing, volume, classic, stopped, remembered, runtimeErrors: errors, httpErrors, screenshots: [mainShot, classicShot] }, null, 2))
ws.close()
