interface Props {
  number: string
  title: string
  body: string
  theme?: 'light' | 'dark'
}

export function HowItWorksStep({ number, title, body, theme = 'light' }: Props) {
  const isDark = theme === 'dark'
  const numberColor = isDark
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-brand)]'
  const numberSize = isDark
    ? 'text-[length:var(--text-mega)]'
    : 'text-[length:var(--text-display)]'
  const titleColor = isDark
    ? 'text-[var(--color-text-on-dark)]'
    : 'text-[var(--color-brand-text)]'
  const bodyColor = isDark
    ? 'text-[var(--color-text-muted-on-dark)]'
    : 'text-[var(--color-brand-text-secondary)]'

  return (
    <div className="flex flex-col gap-4">
      <span
        className={`font-[var(--font-display)] ${numberSize} ${numberColor} leading-none`}
      >
        {number}
      </span>
      <h3
        className={`font-[var(--font-display)] text-[length:var(--text-h3)] ${titleColor} tracking-[var(--tracking-tight)]`}
      >
        {title}
      </h3>
      <p
        className={`text-[length:var(--text-body)] ${bodyColor} leading-[var(--leading-body)]`}
      >
        {body}
      </p>
    </div>
  )
}
