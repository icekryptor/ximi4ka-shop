import type { PublicTrustStripItem } from '@/lib/api'
import { Stagger } from '@/components/motion'

interface Props {
  items: PublicTrustStripItem[]
}

export function TrustStrip({ items }: Props) {
  if (items.length === 0) return null
  return (
    <Stagger className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[length:var(--text-small)] font-medium text-[var(--color-brand-text-secondary)]">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </span>
      ))}
    </Stagger>
  )
}
