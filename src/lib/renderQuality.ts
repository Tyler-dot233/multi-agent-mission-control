export type RenderQuality = 'balanced' | 'high' | 'ultra'

export const RENDER_QUALITY_KEY = 'aimon.display.render-quality.v1'
export const DEFAULT_RENDER_QUALITY: RenderQuality = 'ultra'

export const RENDER_QUALITY_PROFILES: Record<RenderQuality, {
  label: string
  description: string
  maxPixelRatio: number
  minPixelRatio: number
  sharpen: number
  bloomStrength: number
}> = {
  balanced: {
    label: '流畅',
    description: '轻量渲染 · 保留抗锯齿',
    maxPixelRatio: 1.25,
    minPixelRatio: 1,
    sharpen: 0.12,
    bloomStrength: 0.42,
  },
  high: {
    label: '高清',
    description: '高分屏渲染 · 细节锐化',
    maxPixelRatio: 2,
    minPixelRatio: 1.25,
    sharpen: 0.18,
    bloomStrength: 0.46,
  },
  ultra: {
    label: '极致',
    description: '原生／超采样 · 像素级细节',
    maxPixelRatio: 2.5,
    minPixelRatio: 1.5,
    sharpen: 0.24,
    bloomStrength: 0.48,
  },
}

export function loadRenderQuality(): RenderQuality {
  try {
    const value = localStorage.getItem(RENDER_QUALITY_KEY)
    return value === 'balanced' || value === 'high' || value === 'ultra' ? value : DEFAULT_RENDER_QUALITY
  } catch {
    return DEFAULT_RENDER_QUALITY
  }
}

export function saveRenderQuality(quality: RenderQuality) {
  try {
    localStorage.setItem(RENDER_QUALITY_KEY, quality)
  } catch {
    // 无持久化权限时仍可在当前会话调节。
  }
}
