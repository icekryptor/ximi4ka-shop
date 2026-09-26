interface Props {
  surface?: 'cream' | 'ink' | 'bright'
  size?: number
}

// Пунктирная сетка Decor/LabGrid с фиолетового hero (Figma 17:130): линии
// #F4F1FF, прозрачность 10%, штрих 2/2. Плитка size×size, штрихи стыкуются
// между плитками, пока size делится на 4.
function brightTile(size: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><path d='M0.5 0V${size}M0 0.5H${size}' stroke='#F4F1FF' stroke-opacity='0.1' stroke-dasharray='2 2'/></svg>`
  // encodeURIComponent оставляет «'» как есть — кодируем вручную, иначе
  // часть CSS-парсеров отбрасывает url() целиком.
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`
}

// Decorative blueprint grid for use inside <LabSection>. Sits at z-0 so
// content (z-2) and decorative molecules (z-1) layer cleanly above it.
// backgroundImage / backgroundSize are inline because Tailwind 4 utilities
// would lose to the inline style anyway — keeping them inline makes the
// surface/size props the single source of truth.
export function GridOverlay({ surface = 'cream', size = 64 }: Props) {
  const line = surface === 'ink' ? 'var(--color-lj-ink-line)' : 'var(--color-lj-cream-line)'
  const backgroundImage =
    surface === 'bright'
      ? brightTile(size)
      : `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  )
}
