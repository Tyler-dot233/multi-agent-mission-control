export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'hsl(172 80% 45%)',
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="rounded bg-muted/40" aria-hidden />
  }
  const max = Math.max(...data, 1)
  const step = width / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 6)).toFixed(1)}`)
  const area = `0,${height} ${pts.join(' ')} ${width},${height}`
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
