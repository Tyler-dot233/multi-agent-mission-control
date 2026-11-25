export const ORBIT_SPEED_KEY = 'aimon.camera-cruise-speed.v1'

export function loadOrbitSpeed() {
  try {
    const raw = localStorage.getItem(ORBIT_SPEED_KEY)
    if (raw === null) return 1
    const value = Number(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1
  } catch {
    return 1
  }
}

export function saveOrbitSpeed(value: number) {
  try {
    localStorage.setItem(ORBIT_SPEED_KEY, String(value))
  } catch {
    // 无持久化权限时仍可在当前会话调节。
  }
}
