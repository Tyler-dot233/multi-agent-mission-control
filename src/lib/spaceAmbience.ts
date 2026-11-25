const VOLUME_KEY = 'aimon.space-ambience-volume.v1'
const DEFAULT_VOLUME = 32
const MAX_MASTER_GAIN = 0.22

function storedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw === null || raw.trim() === '') return DEFAULT_VOLUME
    const saved = Number(raw)
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

/**
 * 本地生成的太空音景：持续低音、呼吸泛音、棕色噪声和卷积混响。
 * 音频图只创建一次；暂停时淡出并挂起 AudioContext，不消耗后台音频渲染资源。
 */
class SpaceAmbience {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private volume = storedVolume()
  private suspendTimer: ReturnType<typeof setTimeout> | null = null
  playing = false

  getVolume() {
    return this.volume
  }

  async start() {
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer)
      this.suspendTimer = null
    }
    if (!this.context) this.createGraph()
    if (!this.context || !this.master) throw new Error('当前环境不支持 Web Audio')

    await this.context.resume()
    this.playing = true
    const now = this.context.currentTime
    const gain = this.master.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime((this.volume / 100) * MAX_MASTER_GAIN, now + 1.8)
  }

  stop() {
    this.playing = false
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    const gain = this.master.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + 0.8)
    this.suspendTimer = setTimeout(() => {
      if (!this.playing && this.context?.state === 'running') void this.context.suspend()
      this.suspendTimer = null
    }, 900)
  }

  setVolume(next: number) {
    this.volume = Math.min(100, Math.max(0, Math.round(next)))
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      // 无持久化权限时仍可在当前会话调节音量。
    }
    if (!this.context || !this.master || !this.playing) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime((this.volume / 100) * MAX_MASTER_GAIN, now, 0.08)
  }

  private createGraph() {
    const context = new AudioContext()
    const master = context.createGain()
    const compressor = context.createDynamicsCompressor()
    const dryBus = context.createGain()
    const reverb = context.createConvolver()
    const wetGain = context.createGain()

    master.gain.value = 0
    compressor.threshold.value = -20
    compressor.knee.value = 18
    compressor.ratio.value = 4
    compressor.attack.value = 0.08
    compressor.release.value = 0.8
    dryBus.gain.value = 0.82
    wetGain.gain.value = 0.3

    dryBus.connect(master)
    dryBus.connect(reverb)
    reverb.connect(wetGain)
    wetGain.connect(master)
    master.connect(compressor)
    compressor.connect(context.destination)
    reverb.buffer = this.createImpulse(context, 4.2)

    const voices = [
      { frequency: 55, gain: 0.2, pan: -0.38, rate: 0.027, detune: -3 },
      { frequency: 82.4069, gain: 0.09, pan: 0.42, rate: 0.041, detune: 2 },
      { frequency: 110, gain: 0.055, pan: -0.16, rate: 0.033, detune: 3 },
      { frequency: 164.8138, gain: 0.035, pan: 0.55, rate: 0.052, detune: -4 },
      { frequency: 220, gain: 0.014, pan: 0.08, rate: 0.019, detune: 1 },
    ]

    for (const voice of voices) {
      const oscillator = context.createOscillator()
      const filter = context.createBiquadFilter()
      const envelope = context.createGain()
      const panner = context.createStereoPanner()
      const breath = context.createOscillator()
      const breathDepth = context.createGain()
      const drift = context.createOscillator()
      const driftDepth = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = voice.frequency
      oscillator.detune.value = voice.detune
      filter.type = 'lowpass'
      filter.frequency.value = 620
      filter.Q.value = 0.45
      envelope.gain.value = voice.gain
      panner.pan.value = voice.pan
      breath.frequency.value = voice.rate
      breathDepth.gain.value = voice.gain * 0.28
      drift.frequency.value = voice.rate * 0.43
      driftDepth.gain.value = 2.5

      breath.connect(breathDepth)
      breathDepth.connect(envelope.gain)
      drift.connect(driftDepth)
      driftDepth.connect(oscillator.detune)
      oscillator.connect(filter)
      filter.connect(envelope)
      envelope.connect(panner)
      panner.connect(dryBus)
      oscillator.start()
      breath.start()
      drift.start()
    }

    const noise = context.createBufferSource()
    const noiseFilter = context.createBiquadFilter()
    const noiseGain = context.createGain()
    noise.buffer = this.createBrownNoise(context, 6)
    noise.loop = true
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 280
    noiseFilter.Q.value = 0.35
    noiseGain.gain.value = 0.045
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(dryBus)
    noise.start()

    this.context = context
    this.master = master
  }

  private createBrownNoise(context: AudioContext, seconds: number) {
    const length = Math.floor(context.sampleRate * seconds)
    const buffer = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel)
      let last = 0
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.2
      }
    }
    return buffer
  }

  private createImpulse(context: AudioContext, seconds: number) {
    const length = Math.floor(context.sampleRate * seconds)
    const impulse = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        const decay = Math.pow(1 - i / length, 2.8)
        data[i] = (Math.random() * 2 - 1) * decay
      }
    }
    return impulse
  }
}

export const spaceAmbience = new SpaceAmbience()
