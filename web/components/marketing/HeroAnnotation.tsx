interface Props { primary: string; secondary: string }
export function HeroAnnotation({ primary, secondary }: Props) {
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-[5.5rem] right-8 z-[3] text-right font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-55 pointer-events-none before:content-[''] before:block before:w-20 before:h-px before:bg-current before:opacity-35 before:mb-2 before:ml-auto"
    >
      <span>{primary}</span><br /><span>{secondary}</span>
    </div>
  )
}
