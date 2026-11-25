import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { startMonitorServer } from '../server/serve.mjs'

const MINI_WIDTHS = [600, 650, 720, 780, 840]
const MINI_HEIGHT = 260

let monitor = null
let mainWindow = null
let miniWindow = null
let miniScale = 1
let miniAgentCount = 4
let miniScaleTimer = null
let finishMiniScaleAnimation = null
let appOrigin = ''
let restoreOnMiniClose = true
let isQuitting = false

const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const tabs = new Set(['overview', 'tasks', 'alerts', 'approvals', 'events'])

function cancelMiniScaleAnimation() {
  if (miniScaleTimer) clearInterval(miniScaleTimer)
  miniScaleTimer = null
  finishMiniScaleAnimation?.()
  finishMiniScaleAnimation = null
}

function miniWidthForCount(count) {
  return MINI_WIDTHS[Math.max(0, Math.min(4, count))]
}

function applyMiniWindowSize(win, scale, baseWidth, center) {
  const width = Math.round(baseWidth * scale)
  const height = Math.round(MINI_HEIGHT * scale)
  const bounds = win.getBounds()
  const anchor = center ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  win.webContents.setZoomFactor(scale)
  win.setBounds({
    x: Math.round(anchor.x - width / 2),
    y: Math.round(anchor.y - height / 2),
    width,
    height,
  })
}

function animateMiniScale(targetScale, targetBaseWidth = miniWidthForCount(miniAgentCount)) {
  cancelMiniScaleAnimation()
  return new Promise((resolve) => {
    finishMiniScaleAnimation = resolve
    const win = miniWindow
    if (!win || win.isDestroyed()) {
      cancelMiniScaleAnimation()
      return
    }
    const initialScale = win.webContents.getZoomFactor()
    const bounds = win.getBounds()
    const initialBaseWidth = bounds.width / initialScale
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    if (Math.abs(initialScale - targetScale) < 0.001 && Math.abs(initialBaseWidth - targetBaseWidth) < 0.5) {
      applyMiniWindowSize(win, targetScale, targetBaseWidth, center)
      cancelMiniScaleAnimation()
      return
    }
    const startedAt = Date.now()
    miniScaleTimer = setInterval(() => {
      if (!win || win.isDestroyed()) {
        cancelMiniScaleAnimation()
        return
      }
      const progress = Math.min(1, (Date.now() - startedAt) / 180)
      const eased = 1 - Math.pow(1 - progress, 3)
      applyMiniWindowSize(win, initialScale + (targetScale - initialScale) * eased, initialBaseWidth + (targetBaseWidth - initialBaseWidth) * eased, center)
      if (progress === 1) cancelMiniScaleAnimation()
    }, 16)
  })
}

function secureWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appOrigin)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) event.preventDefault()
  })
}

async function ensureMonitor() {
  if (monitor) return
  monitor = await startMonitorServer({ port: 0 })
  appOrigin = `http://${monitor.host}:${monitor.port}`
}

async function createWindow(initialTab) {
  await ensureMonitor()
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: '多智能体监控台',
    backgroundColor: '#05070d',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  secureWindow(mainWindow)
  await mainWindow.loadURL(appOrigin)
  if (tabs.has(initialTab)) mainWindow.webContents.send('aimon:open-tab', initialTab)
}

async function showMain(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow(tab)
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
  if (tabs.has(tab)) mainWindow.webContents.send('aimon:open-tab', tab)
}

async function createMiniWindow() {
  await ensureMonitor()
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
    return
  }

  restoreOnMiniClose = true
  miniWindow = new BrowserWindow({
    width: Math.round(miniWidthForCount(miniAgentCount) * miniScale),
    height: Math.round(MINI_HEIGHT * miniScale),
    show: false,
    title: '多智能体悬浮窗',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  if (process.platform === 'darwin') {
    miniWindow.setAlwaysOnTop(true, 'floating')
    miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  miniWindow.on('closed', () => {
    cancelMiniScaleAnimation()
    miniWindow = null
    if (!isQuitting && restoreOnMiniClose) void showMain()
  })
  secureWindow(miniWindow)
  miniWindow.webContents.setZoomFactor(miniScale)
  await miniWindow.loadURL(`${appOrigin}/?mini=1`)
  miniWindow.show()
  miniWindow.focus()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
}

function closeMini(restore = true) {
  restoreOnMiniClose = restore
  cancelMiniScaleAnimation()
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close()
  else if (restore) void showMain()
}

ipcMain.handle('aimon:open-mini', () => createMiniWindow())
ipcMain.handle('aimon:close-mini', () => closeMini(true))
ipcMain.handle('aimon:expand-main', async (_event, tab) => {
  closeMini(false)
  await showMain(tab)
})
ipcMain.handle('aimon:set-mini-top', (_event, enabled) => {
  const value = Boolean(enabled)
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.setAlwaysOnTop(value, process.platform === 'darwin' ? 'floating' : 'normal')
  }
  return value
})
ipcMain.handle('aimon:set-mini-scale', async (_event, scale) => {
  const numeric = Number(scale)
  const targetScale = Number.isFinite(numeric) ? Math.max(0.75, Math.min(1.5, numeric)) : 1
  miniScale = targetScale
  await animateMiniScale(targetScale)
  const bounds = miniWindow && !miniWindow.isDestroyed() ? miniWindow.getBounds() : null
  return { scale: targetScale, width: bounds?.width ?? Math.round(miniWidthForCount(miniAgentCount) * targetScale), height: bounds?.height ?? Math.round(MINI_HEIGHT * targetScale) }
})
ipcMain.handle('aimon:set-mini-agent-count', async (_event, count) => {
  const numeric = Number(count)
  miniAgentCount = Number.isFinite(numeric) ? Math.max(0, Math.min(4, Math.round(numeric))) : 4
  await animateMiniScale(miniScale)
  const bounds = miniWindow && !miniWindow.isDestroyed() ? miniWindow.getBounds() : null
  return { count: miniAgentCount, width: bounds?.width ?? Math.round(miniWidthForCount(miniAgentCount) * miniScale), height: bounds?.height ?? Math.round(MINI_HEIGHT * miniScale) }
})

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    else void showMain()
  })
}).catch((err) => {
  console.error('[agent-monitor] startup failed:', err)
  app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  cancelMiniScaleAnimation()
  if (monitor) monitor.server.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
