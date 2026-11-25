export {}

declare global {
  interface Window {
    aimonDesktop?: {
      openMini: () => Promise<void>
      expandMain: (tab?: string) => Promise<void>
      closeMini: () => Promise<void>
      setMiniAlwaysOnTop: (enabled: boolean) => Promise<boolean>
      setMiniScale: (scale: number) => Promise<{ scale: number; width: number; height: number }>
      setMiniAgentCount: (count: number) => Promise<{ count: number; width: number; height: number }>
      onOpenTab: (callback: (tab: string) => void) => () => void
    }
  }
}
