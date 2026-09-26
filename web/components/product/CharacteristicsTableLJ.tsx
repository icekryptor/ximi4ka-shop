interface Props {
  characteristics: Record<string, string>
  // 'ink' — тёмный data sheet (исходный вариант), 'light' — вкладка
  // «Характеристики» на белом hero страницы товара.
  surface?: 'ink' | 'light'
}

const SURFACE = {
  ink: {
    rule: 'border-[var(--color-lj-rule-on-ink)]',
    label: 'text-[var(--color-lj-bone-mute)]',
    value: 'text-[var(--color-lj-bone)]',
  },
  light: {
    rule: 'border-[var(--color-lj-rule)]',
    label: 'text-[var(--color-lj-ink)] opacity-60',
    value: 'text-[var(--color-lj-ink)]',
  },
} as const

export function CharacteristicsTableLJ({ characteristics, surface = 'ink' }: Props) {
  const entries = Object.entries(characteristics)
  if (entries.length === 0) return null
  const tone = SURFACE[surface]
  return (
    <dl className="flex flex-col">
      {entries.map(([label, value], i) => (
        <div
          key={label}
          data-char-row
          className={`grid grid-cols-[minmax(10rem,1fr)_2fr] items-baseline gap-6 py-3 ${
            i < entries.length - 1 ? `border-b ${tone.rule}` : ''
          }`}
        >
          <dt
            className={`font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] ${tone.label}`}
          >
            {label}
          </dt>
          <dd className={`font-lj-body text-[1.0625rem] ${tone.value}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
