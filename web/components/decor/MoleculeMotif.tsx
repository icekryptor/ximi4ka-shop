type Variant = 'subtle' | 'vivid'

interface Props {
  variant?: Variant
  className?: string
}

// Six atoms in a benzene-ring-ish layout with one branching off.
// Coordinates kept loose; the motif is decorative, not literal chemistry.
const ATOMS: Array<[number, number, number]> = [
  // [cx, cy, r]
  [200, 70, 22],
  [320, 140, 22],
  [320, 280, 22],
  [200, 350, 22],
  [80, 280, 22],
  [80, 140, 22],
  [200, 200, 18], // central
]

const BONDS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  [0, 6], [2, 6], [4, 6],
]

export function MoleculeMotif({ variant = 'subtle', className = '' }: Props) {
  const stroke =
    variant === 'vivid' ? 'var(--color-brand)' : 'var(--color-border-strong)'
  const fill =
    variant === 'vivid' ? 'rgba(131, 110, 254, 0.08)' : 'transparent'

  return (
    <svg
      aria-hidden="true"
      data-variant={variant}
      viewBox="0 0 400 400"
      width="100%"
      height="100%"
      className={className}
    >
      {BONDS.map(([a, b], i) => (
        <line
          key={`bond-${i}`}
          x1={ATOMS[a][0]}
          y1={ATOMS[a][1]}
          x2={ATOMS[b][0]}
          y2={ATOMS[b][1]}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {ATOMS.map(([cx, cy, r], i) => (
        <circle
          key={`atom-${i}`}
          cx={cx}
          cy={cy}
          r={r}
          stroke={stroke}
          strokeWidth={2.5}
          fill={fill}
        />
      ))}
    </svg>
  )
}
