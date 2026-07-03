type TickerSurface = 'bright' | 'dark' | 'soft'

interface Props {
  items: string[]
  surface?: TickerSurface
  className?: string
}

// v3.5: поверхность `bright` — фирменный градиент (см. V3_5_BRIGHT_ADDENDUM).
// v2-оранжевый `accent` удалён; `dark` переведён на ink-поверхность v3.
const surfaceClass: Record<TickerSurface, string> = {
  bright: 'bg-[image:var(--gradient-lj-bright)] text-[var(--color-lj-on-bright)]',
  dark: 'bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)]',
  soft: 'bg-[var(--color-lj-cream-shade)] text-[var(--color-lj-ink)]',
}

const dotClass: Record<TickerSurface, string> = {
  bright: 'bg-[var(--color-lj-on-bright)]',
  dark: 'bg-[var(--color-lj-brand)]',
  soft: 'bg-[var(--color-lj-brand)]',
}

export function Ticker({ items, surface = 'bright', className = '' }: Props) {
  if (items.length === 0) return null
  // Duplicate items so the marquee loops seamlessly when track translates -50%.
  const doubled = [...items, ...items]
  return (
    <div
      className={`relative overflow-hidden ${surfaceClass[surface]} ${className}`}
    >
      <div className="animate-ticker-scroll flex whitespace-nowrap py-2.5 hover:[animation-play-state:paused]">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="mx-6 inline-flex items-center gap-3.5 font-lj-mono text-[length:var(--text-lj-mono-sm)] font-medium uppercase tracking-[0.08em]"
          >
            <span
              aria-hidden="true"
              className={`w-1 h-1 rounded-full ${dotClass[surface]}`}
            />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
