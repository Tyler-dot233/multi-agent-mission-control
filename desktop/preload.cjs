const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aimonDesktop', {
  openMini: () => ipcRenderer.invoke('aimon:open-mini'),
  expandMain: (tab) => ipcRenderer.invoke('aimon:expand-main', tab),
  closeMini: () => ipcRenderer.invoke('aimon:close-mini'),
  setMiniAlwaysOnTop: (enabled) => ipcRenderer.invoke('aimon:set-mini-top', enabled),
  setMiniScale: (scale) => ipcRenderer.invoke('aimon:set-mini-scale', scale),
  setMiniAgentCount: (count) => ipcRenderer.invoke('aimon:set-mini-agent-count', count),
  onOpenTab: (callback) => {
    const listener = (_event, tab) => callback(tab)
    ipcRenderer.on('aimon:open-tab', listener)
    return () => ipcRenderer.removeListener('aimon:open-tab', listener)
  },
})
