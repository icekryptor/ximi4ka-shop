interface Props { figNumber: string; arr: string }
export function HeroFigtag({ figNumber, arr }: Props) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-[5.5rem] left-1/2 -translate-x-1/2 z-[2] flex gap-5 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-40 pointer-events-none"
    >
      <span className="inline-flex items-center gap-1.5 before:content-[''] before:w-3.5 before:h-px before:bg-current before:opacity-60">fig. {figNumber}</span>
      <span className="inline-flex items-center gap-1.5 before:content-[''] before:w-3.5 before:h-px before:bg-current before:opacity-60">arr. {arr}</span>
    </div>
  )
}
