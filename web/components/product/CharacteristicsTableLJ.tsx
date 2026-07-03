interface Props {
  characteristics: Record<string, string>
}

export function CharacteristicsTableLJ({ characteristics }: Props) {
  const entries = Object.entries(characteristics)
  if (entries.length === 0) return null
  return (
    <dl className="flex flex-col">
      {entries.map(([label, value], i) => (
        <div
          key={label}
          data-char-row
          className={`grid grid-cols-[minmax(10rem,1fr)_2fr] items-baseline gap-6 py-3 ${
            i < entries.length - 1 ? 'border-b border-[var(--color-lj-rule-on-ink)]' : ''
          }`}
        >
          <dt className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-bone-mute)]">
            {label}
          </dt>
          <dd className="font-lj-body text-[1.0625rem] text-[var(--color-lj-bone)]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
