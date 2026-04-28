interface Fact { label: string; value: string }
interface Props { facts: Fact[] }

export function KeyFactsListLJ({ facts }: Props) {
  if (facts.length === 0) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-2 border-t border-[var(--color-lj-rule)] pt-4">
      {facts.map((f, i) => (
        <li
          key={f.label}
          className="grid grid-cols-[minmax(8rem,auto)_1fr] items-baseline gap-3 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em]"
        >
          <span className="text-[var(--color-lj-ink)] opacity-70 whitespace-nowrap">
            {pad(i + 1)} / {f.label}
          </span>
          <span className="font-[var(--font-lj-display)] font-[700] text-[0.95rem] text-[var(--color-lj-ink)] tracking-[-0.02em] normal-case">
            {f.value}
          </span>
        </li>
      ))}
    </ul>
  )
}
