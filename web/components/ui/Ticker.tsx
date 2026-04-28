type TickerSurface = 'accent' | 'dark' | 'soft'

interface Props {
  items: string[]
  surface?: TickerSurface
  className?: string
}

const surfaceClass: Record<TickerSurface, string> = {
  accent: 'bg-[var(--color-accent)] text-white',
  dark: 'bg-[var(--color-dark-base)] text-[var(--color-text-on-dark)]',
  soft: 'bg-[var(--color-surface-soft)] text-[var(--color-brand-text)]',
}

export function Ticker({ items, surface = 'accent', className = '' }: Props) {
  if (items.length === 0) return null
  // Duplicate items so the marquee loops seamlessly when track translates -50%.
  const doubled = [...items, ...items]
  return (
    <div
      className={`relative overflow-hidden ${surfaceClass[surface]} ${className}`}
    >
      <div className="animate-ticker-scroll flex whitespace-nowrap py-2 hover:[animation-play-state:paused]">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="mx-8 inline-flex items-center text-[length:var(--text-small)] font-medium"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
