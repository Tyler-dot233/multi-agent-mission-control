import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { AudioLines, Gauge, RotateCcw, Settings2, Sparkles, Type, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { spaceAmbience } from '@/lib/spaceAmbience'
import { RENDER_QUALITY_PROFILES, type RenderQuality } from '@/lib/renderQuality'

export function PageSettings({
  cruiseSpeed,
  onCruiseSpeedChange,
  fontSize,
  onFontSizeChange,
  renderQuality,
  onRenderQualityChange,
  onReset,
}: {
  cruiseSpeed: number
  onCruiseSpeedChange: (value: number) => void
  fontSize: number
  onFontSizeChange: (value: number) => void
  renderQuality: RenderQuality
  onRenderQualityChange: (value: RenderQuality) => void
  onReset: () => void
}) {
  const [playing, setPlaying] = useState(spaceAmbience.playing)
  const [volume, setVolume] = useState(spaceAmbience.getVolume())
  const [error, setError] = useState('')

  const toggleAudio = async () => {
    setError('')
    if (playing) {
      spaceAmbience.stop()
      setPlaying(false)
      return
    }
    try {
      await spaceAmbience.start()
      setPlaying(true)
    } catch (reason: unknown) {
      setPlaying(false)
      setError(reason instanceof Error ? reason.message : '音频启动失败')
    }
  }

  const changeVolume = ([next]: number[]) => {
    setVolume(next)
    spaceAmbience.setVolume(next)
  }

  const reset = () => {
    onReset()
    setVolume(32)
    spaceAmbience.setVolume(32)
    setError('')
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button size="sm" variant="outline" className="pointer-events-auto h-8 w-8 shrink-0 cursor-pointer border-primary/30 bg-background/50 p-0 text-primary backdrop-blur" aria-label="页面设置" title="页面设置">
          <Settings2 className="h-4 w-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          collisionPadding={14}
          aria-label="页面设置面板"
          className="z-[80] w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-primary/30 bg-[hsl(222_38%_6%/0.96)] p-4 text-foreground shadow-[0_20px_70px_hsl(220_80%_2%/0.8),0_0_28px_hsl(172_80%_45%/0.08)] backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="mb-4 flex items-center justify-between border-b border-primary/15 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wider text-primary"><Settings2 className="h-4 w-4" />页面设置</h2>
              <p className="mt-1 text-[9px] tracking-[0.18em] text-muted-foreground">DISPLAY & AMBIENCE</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 cursor-pointer px-2 text-[10px] text-muted-foreground hover:text-primary" onClick={reset}>
              <RotateCcw className="h-3 w-3" />恢复默认
            </Button>
          </div>

          <div className="space-y-5">
            <section aria-labelledby="render-quality-setting">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label id="render-quality-setting" className="flex items-center gap-2 text-xs"><Sparkles className="h-4 w-4 text-primary" />渲染画质</label>
                <output className="font-data text-[10px] text-primary">{RENDER_QUALITY_PROFILES[renderQuality].label}</output>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-md border border-primary/15 bg-background/50 p-1" role="group" aria-label="渲染画质档位">
                {(Object.keys(RENDER_QUALITY_PROFILES) as RenderQuality[]).map((value) => {
                  const profile = RENDER_QUALITY_PROFILES[value]
                  const active = renderQuality === value
                  return (
                    <Button key={value} type="button" variant="outline" size="sm" aria-label={`画质${profile.label}`} aria-pressed={active} onClick={() => onRenderQualityChange(value)} className={`h-7 cursor-pointer border-transparent text-[10px] ${active ? 'border-primary/45 bg-primary/15 text-primary shadow-[inset_0_0_12px_hsl(172_80%_45%/0.08)]' : 'text-muted-foreground hover:text-foreground'}`}>
                      {profile.label}
                    </Button>
                  )
                })}
              </div>
              <p className="mt-2 text-[9px] text-muted-foreground">{RENDER_QUALITY_PROFILES[renderQuality].description} · SMAA 抗锯齿</p>
            </section>

            <section aria-labelledby="space-audio-setting">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  {playing ? <AudioLines className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <h3 id="space-audio-setting">太空寂静音景</h3>
                    <p className="text-[10px] text-muted-foreground">本地生成 · 无网络音频</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className={`h-7 cursor-pointer px-2 text-[10px] ${playing ? 'border-primary/50 text-primary' : 'text-muted-foreground'}`} onClick={() => void toggleAudio()} aria-label={playing ? '关闭太空寂静背景音乐' : '开启太空寂静背景音乐'} aria-pressed={playing}>
                  {playing ? '关闭' : '开启'}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Slider className="cursor-pointer" value={[volume]} min={0} max={100} step={1} onValueChange={changeVolume} aria-label="背景音量" />
                <output className="font-data w-10 text-right text-[11px] text-primary">{volume}%</output>
              </div>
              {error && <p className="mt-2 text-[10px] text-destructive" role="alert">{error}</p>}
            </section>

            <section aria-labelledby="cruise-speed-setting">
              <div className="mb-2 flex items-center justify-between">
                <label id="cruise-speed-setting" className="flex items-center gap-2 text-xs"><Gauge className="h-4 w-4 text-primary" />镜头巡航</label>
                <output className="font-data text-[11px] text-primary">{cruiseSpeed.toFixed(2)}×</output>
              </div>
              <Slider className="cursor-pointer" value={[cruiseSpeed]} min={0} max={2} step={0.25} onValueChange={([next]) => onCruiseSpeedChange(next)} aria-label="镜头巡航转速" />
              <div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>暂停</span><span>标准</span><span>2 倍</span></div>
            </section>

            <section aria-labelledby="font-size-setting">
              <div className="mb-2 flex items-center justify-between">
                <label id="font-size-setting" className="flex items-center gap-2 text-xs"><Type className="h-4 w-4 text-primary" />界面字体</label>
                <output className="font-data text-[11px] text-primary">{fontSize}%</output>
              </div>
              <Slider className="cursor-pointer" value={[fontSize]} min={90} max={140} step={2} onValueChange={([next]) => onFontSizeChange(next)} aria-label="界面字体大小" />
              <div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>紧凑</span><span>标准</span><span>特大</span></div>
            </section>
          </div>
          <Popover.Arrow className="fill-primary/30" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
