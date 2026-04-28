interface Props {
  value: number | string
  label: string
  suffix?: string
  prefix?: string
  className?: string
}

export function BigNumber({
  value,
  label,
  suffix = '',
  prefix = '',
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span
        data-bignumber-value
        className="font-[var(--font-display)] tracking-[var(--tracking-mega)] leading-[0.9] text-[length:var(--text-mega)] text-[var(--color-text-on-dark)]"
      >
        {prefix}
        {value}
        {suffix}
      </span>
      <span
        data-bignumber-underline
        aria-hidden="true"
        className="h-[3px] w-12 rounded-full bg-[var(--color-accent)]"
      />
      <span className="text-[length:var(--text-small)] font-medium uppercase tracking-wider text-[var(--color-text-muted-on-dark)]">
        {label}
      </span>
    </div>
  )
}
