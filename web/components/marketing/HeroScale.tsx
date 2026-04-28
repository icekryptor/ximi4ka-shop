interface Props { caption: string }
export function HeroScale({ caption }: Props) {
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-[5.5rem] left-8 z-[3] flex flex-col gap-1.5 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-55 pointer-events-none"
    >
      <svg viewBox="0 0 200 16" width="200" height="16">
        <line x1="2" y1="8" x2="198" y2="8" stroke="currentColor" strokeWidth="1" />
        <g stroke="currentColor" strokeWidth="1">
          <line x1="2" y1="3" x2="2" y2="13" />
          <line x1="42" y1="5" x2="42" y2="11" />
          <line x1="82" y1="5" x2="82" y2="11" />
          <line x1="122" y1="5" x2="122" y2="11" />
          <line x1="162" y1="5" x2="162" y2="11" />
          <line x1="198" y1="3" x2="198" y2="13" />
        </g>
      </svg>
      <span>{caption}</span>
    </div>
  )
}
