interface Props {
  surface?: 'cream' | 'ink'
  size?: number
}

// Decorative blueprint grid for use inside <LabSection>. Sits at z-0 so
// content (z-2) and decorative molecules (z-1) layer cleanly above it.
// backgroundImage / backgroundSize are inline because Tailwind 4 utilities
// would lose to the inline style anyway — keeping them inline makes the
// surface/size props the single source of truth.
export function GridOverlay({ surface = 'cream', size = 64 }: Props) {
  const line = surface === 'ink' ? 'var(--color-lj-ink-line)' : 'var(--color-lj-cream-line)'
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  )
}
