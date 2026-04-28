interface Props {
  points: string[]
  active: number
}

export function Timeline({ points, active }: Props) {
  const w = 220
  const step = (w - 24) / Math.max(points.length - 1, 1)
  return (
    <svg viewBox={`0 0 ${w} 36`} className="w-full" aria-hidden="true">
      <line x1={12} y1={18} x2={w - 12} y2={18} stroke="rgba(239,237,230,0.25)" strokeWidth={1} />
      {points.map((label, i) => {
        const cx = 12 + i * step
        const isActive = i === active
        return (
          <g key={i}>
            <circle
              cx={cx} cy={18}
              r={isActive ? 6 : 3}
              fill={isActive ? '#836efe' : 'rgba(239,237,230,0.6)'}
              stroke={isActive ? 'none' : 'rgba(239,237,230,0.6)'}
              strokeWidth={isActive ? 0 : 1.2}
            />
            <text
              x={cx} y={34}
              fontFamily="var(--font-lj-mono)"
              fontSize={8}
              fill={isActive ? '#836efe' : 'rgba(239,237,230,0.55)'}
              textAnchor="middle"
            >
              '{label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
