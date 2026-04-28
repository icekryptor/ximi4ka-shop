interface Props {
  mantissa: string
  base: string
  exponent: string
  units: string
}

export function Scientific({ mantissa, base, exponent, units }: Props) {
  return (
    <div className="flex items-baseline gap-1 font-[var(--font-lj-display)] font-[700] text-2xl tracking-[-0.03em] text-[var(--color-lj-bone)]">
      <span>{mantissa}</span>
      <span className="font-[var(--font-lj-mono)] font-normal text-[var(--color-lj-brand)] mx-0.5 text-lg">×</span>
      <span>{base}</span>
      <sup className="font-[var(--font-lj-display)] text-base text-[var(--color-lj-brand)] -translate-y-2">{exponent}</sup>
      <span className="font-[var(--font-lj-mono)] font-normal text-[0.7rem] text-[var(--color-lj-bone-mute)] uppercase tracking-[0.08em] ml-2">= {units}</span>
    </div>
  )
}
