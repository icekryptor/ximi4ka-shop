interface Props {
  ratio: '4-5' | '1-1'
  className?: string
}

export function DashedRectMark({ ratio, className = '' }: Props) {
  // viewBox sized so stroke widths render identically across both ratios
  const [vw, vh] = ratio === '4-5' ? [80, 100] : [100, 100]
  return (
    <svg
      data-mark="dashed-rect"
      viewBox={`0 0 ${vw} ${vh}`}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeDasharray="4 6"
      aria-hidden
    >
      <rect x="6" y="6" width={vw - 12} height={vh - 12} />
      <line x1="6" y1="6" x2={vw - 6} y2={vh - 6} strokeWidth="0.5" />
    </svg>
  )
}
