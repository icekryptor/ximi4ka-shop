interface Props {
  number: string
  title: string
  body: string
}

export function HowItWorksStep({ number, title, body }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-[var(--font-display)] text-[length:var(--text-display)] text-[var(--color-brand)] leading-none">
        {number}
      </span>
      <h3 className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)]">
        {title}
      </h3>
      <p className="text-[length:var(--text-body)] text-[var(--color-brand-text-secondary)] leading-[var(--leading-body)]">
        {body}
      </p>
    </div>
  )
}
