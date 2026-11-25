export const FONT_SIZE_KEY = 'aimon.display.font-size.v1'
export const DEFAULT_FONT_SIZE = 112

export function loadFontSize() {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY)
    if (raw === null) return DEFAULT_FONT_SIZE
    const value = Number(raw)
    return Number.isFinite(value) ? Math.max(90, Math.min(140, value)) : DEFAULT_FONT_SIZE
  } catch {
    return DEFAULT_FONT_SIZE
  }
}
