interface Props { value: number; max: number }

export function Rating({ value, max }: Props) {
  const fullCount = Math.floor(value)
  const partial = value - fullCount
  const w = 220
  const cellW = w / max
  return (
    <svg viewBox={`0 0 ${w} 28`} className="w-full" aria-hidden="true">
      {Array.from({ length: fullCount }).map((_, i) => (
        <circle
          key={`full-${i}`}
          cx={cellW * (i + 0.5)} cy={14} r={11}
          fill="#836efe"
        />
      ))}
      {partial > 0 && fullCount < max && (
        <>
          <circle
            cx={cellW * (fullCount + 0.5)} cy={14} r={11}
            fill="none" stroke="#836efe" strokeWidth={1.5}
          />
          <clipPath id={`rating-clip-${fullCount}`}>
            <rect
              x={cellW * (fullCount + 0.5) - 11}
              y={3}
              width={22 * partial}
              height={22}
            />
          </clipPath>
          <circle
            cx={cellW * (fullCount + 0.5)} cy={14} r={11}
            fill="#836efe" clipPath={`url(#rating-clip-${fullCount})`}
          />
        </>
      )}
    </svg>
  )
}
