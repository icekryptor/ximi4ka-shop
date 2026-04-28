type Variant = 'benzene' | 'anthracene' | 'water' | 'methane'

interface Props {
  variant: Variant
  className?: string
  style?: React.CSSProperties
}

export function MoleculeMotifLJ({ variant, className = '', style }: Props) {
  if (variant === 'benzene') {
    return (
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className={className}
        style={style}
      >
        <g stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
          <polygon points="200,40 348,125 348,275 200,360 52,275 52,125" />
          <circle cx="200" cy="200" r="86" />
          <line x1="200" y1="40" x2="200" y2="2" />
          <line x1="348" y1="125" x2="386" y2="105" />
          <line x1="348" y1="275" x2="386" y2="295" />
          <line x1="200" y1="360" x2="200" y2="398" />
          <line x1="52" y1="275" x2="14" y2="295" />
          <line x1="52" y1="125" x2="14" y2="105" />
        </g>
      </svg>
    )
  }
  if (variant === 'anthracene') {
    return (
      <svg viewBox="0 0 600 280" aria-hidden="true" className={className} style={style}>
        <g stroke="currentColor" fill="none" strokeWidth={1}>
          <polygon points="100,40 200,90 200,190 100,240 0,190 0,90" />
          <circle cx="100" cy="140" r="62" />
          <polygon points="300,40 400,90 400,190 300,240 200,190 200,90" />
          <circle cx="300" cy="140" r="62" />
          <polygon points="500,40 600,90 600,190 500,240 400,190 400,90" />
          <circle cx="500" cy="140" r="62" />
        </g>
      </svg>
    )
  }
  if (variant === 'water') {
    return (
      <svg viewBox="0 0 110 60" aria-hidden="true" className={className} style={style}>
        <g stroke="currentColor" fill="none" strokeWidth={1.2} strokeLinecap="round">
          <line x1="20" y1="38" x2="55" y2="22" />
          <line x1="55" y1="22" x2="90" y2="38" />
        </g>
        <text x="14" y="44" fontFamily="var(--font-lj-mono)" fontSize="9" fill="currentColor">H</text>
        <text x="92" y="44" fontFamily="var(--font-lj-mono)" fontSize="9" fill="currentColor">H</text>
        <text x="49" y="18" fontFamily="var(--font-lj-mono)" fontSize="9" fill="currentColor">O</text>
      </svg>
    )
  }
  // methane (placeholder for future use — minimal tetrahedral bonds from center)
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className} style={style}>
      <g stroke="currentColor" fill="none" strokeWidth={1.2}>
        <line x1="50" y1="50" x2="20" y2="20" />
        <line x1="50" y1="50" x2="80" y2="20" />
        <line x1="50" y1="50" x2="20" y2="80" />
        <line x1="50" y1="50" x2="80" y2="80" />
      </g>
    </svg>
  )
}
