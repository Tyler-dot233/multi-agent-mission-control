import { useEffect, useState } from 'react'
import { Maximize, Minimize, Radar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSettings } from '@/sections/PageSettings'
import type { RenderQuality } from '@/lib/renderQuality'

export function HeaderBar({
  platform,
  connected,
  pendingCount,
  cruiseSpeed,
  onCruiseSpeedChange,
  fontSize,
  onFontSizeChange,
  renderQuality,
  onRenderQualityChange,
}: {
  platform: string | null
  connected: boolean
  pendingCount: number
  cruiseSpeed: number
  onCruiseSpeedChange: (value: number) => void
  fontSize: number
  onFontSizeChange: (value: number) => void
  renderQuality: RenderQuality
  onRenderQualityChange: (value: RenderQuality) => void
}) {
  const [now, setNow] = useState(new Date())
  const [isFull, setIsFull] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    const onFs = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      clearInterval(t)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  const platformLabel =
    platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform ?? '—'

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border/70 bg-card/60 px-4 py-3 backdrop-blur md:px-6">
      <div className="radar-sweep flex h-10 w-10 items-center justify-center border border-primary/40 bg-background">
        <Radar className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div className="min-w-0">
        <h1 className="neon-text text-lg font-semibold tracking-[0.2em] text-primary">多智能体监控台</h1>
        <p className="text-xs text-muted-foreground">Multi-Agent Mission Control · 实时监测本机 AI 工作进程</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {pendingCount > 0 && (
          <Badge variant="outline" className="border-[hsl(42_95%_55%/0.6)] text-[hsl(42_95%_60%)]">
            {pendingCount} 项待确认
          </Badge>
        )}
        <Badge variant="outline" className="font-data">{platformLabel}</Badge>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`live-dot inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-[hsl(152_70%_45%)]' : 'bg-[hsl(0_75%_55%)]'
            }`}
            aria-hidden
          />
          <span className="text-muted-foreground">{connected ? '已连接' : '未连接'}</span>
        </div>
        <time className="font-data text-sm text-muted-foreground" suppressHydrationWarning>
          {now.toLocaleTimeString('zh-CN', { hour12: false })}
        </time>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer border-primary/40 text-primary hover:bg-primary/10"
          onClick={toggleFullscreen}
          title="大屏模式（全屏）"
        >
          {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          {isFull ? '退出大屏' : '大屏模式'}
        </Button>
        <PageSettings
          cruiseSpeed={cruiseSpeed}
          onCruiseSpeedChange={onCruiseSpeedChange}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          renderQuality={renderQuality}
          onRenderQualityChange={onRenderQualityChange}
          onReset={() => { onCruiseSpeedChange(1); onFontSizeChange(112); onRenderQualityChange('ultra') }}
        />
      </div>
    </header>
  )
}
