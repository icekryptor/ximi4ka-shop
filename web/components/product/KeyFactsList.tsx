import { extractKeyFacts } from './extractKeyFacts'

interface Props {
  characteristics: Record<string, string>
  className?: string
}

/**
 * Compact 4-row spec sheet built from parsed product characteristics. Renders
 * nothing if no priority key matches — caller does not need to guard.
 */
export function KeyFactsList({ characteristics, className = '' }: Props) {
  const facts = extractKeyFacts(characteristics)
  if (facts.length === 0) return null

  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-3 ${className}`}>
      {facts.map((f) => (
        <div
          key={f.label}
          className="flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-3"
        >
          <dt className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {f.label}
          </dt>
          <dd className="text-[length:var(--text-body)] font-medium text-[var(--color-brand-text)]">
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
