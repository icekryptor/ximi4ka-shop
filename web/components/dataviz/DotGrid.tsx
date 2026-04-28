interface Props {
  total: number
  cols: number
  cellW?: number
  cellH?: number
  dotR?: number
}

export function DotGrid({ total, cols, cellW = 10, cellH = 14, dotR = 2 }: Props) {
  const rows = Math.ceil(total / cols)
  const dots: { cx: number; cy: number; isLast: boolean }[] = []
  for (let i = 0; i < total; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    dots.push({
      cx: c * cellW + cellW / 2,
      cy: r * cellH + cellH / 2,
      isLast: i === total - 1,
    })
  }
  return (
    <svg viewBox={`0 0 ${cols * cellW} ${rows * cellH}`} className="w-full max-h-[110px]" aria-hidden="true">
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx} cy={d.cy} r={dotR}
          fill={d.isLast ? '#836efe' : '#EFEDE6'}
          opacity={d.isLast ? 1 : 0.55}
        />
      ))}
    </svg>
  )
}
