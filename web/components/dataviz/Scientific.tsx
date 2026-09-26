interface Props {
  mantissa: string
  base: string
  exponent: string
  units: string
}

export function Scientific({ mantissa, base, exponent, units }: Props) {
  return (
    <div className="flex items-baseline gap-1 font-lj-display font-[700] text-2xl tracking-[-0.03em] text-[var(--color-lj-bone)]">
      <span>{mantissa}</span>
      <span className="font-lj-mono font-normal text-[var(--color-lj-brand)] mx-0.5 text-lg">
        ×
      </span>
      <span>{base}</span>
      <sup className="font-lj-display text-base text-[var(--color-lj-brand)] -translate-y-2">
        {exponent}
      </sup>
      <span className="font-lj-mazzard font-bold text-sm tracking-normal text-[var(--color-lj-bone-mute)] ml-2">
        = {units}
      </span>
    </div>
  )
}
