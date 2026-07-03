type Position = 'right' | 'left'

interface Props {
  text: string
  position: Position
  topPercent?: number  // 0-100, vertical offset within parent
  className?: string
}

/**
 * Hand-drawn arrow + brand-purple text label.
 *
 * Reveal-on-hover requires a parent element with the `callout-host` class so
 * the Tailwind arbitrary parent-selector `[.callout-host:hover_&]` resolves.
 * Typical usage: <article className="callout-host relative"><Callout … /></article>
 */
export function Callout({ text, position, topPercent = 30, className = '' }: Props) {
  const sideClass = position === 'right'
    ? 'right-[-3.5rem] items-start'
    : 'left-[-3.5rem] items-end'
  const flipStyle = position === 'left' ? { transform: 'scaleX(-1)' } : undefined
  return (
    <div
      aria-hidden="true"
      className={`absolute z-[4] pointer-events-none flex flex-col gap-1 ${sideClass} ${className}`.trim()}
      style={{ top: `${topPercent}%`, width: '110px' }}
    >
      <svg width="110" height="60" viewBox="0 0 110 60" style={flipStyle}>
        <path
          d="M5,30 Q 35,5 90,18 L82,12 M90,18 L84,26"
          fill="none"
          stroke="var(--color-lj-brand)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={220}
          strokeDashoffset={220}
          className="transition-[stroke-dashoffset] duration-[0.8s] [.callout-host:hover_&]:[stroke-dashoffset:0]"
        />
      </svg>
      <span
        className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-brand-deep)] bg-[var(--color-lj-cream)] px-1.5 py-0.5 opacity-0 translate-y-1 transition-[opacity,transform] duration-[0.4s] delay-200 [.callout-host:hover_&]:opacity-100 [.callout-host:hover_&]:translate-y-0"
      >
        {text}
      </span>
    </div>
  )
}
