import type { ReactNode } from 'react'

export interface MicroTrustItem {
  icon: ReactNode
  label: string
}

interface Props {
  items: MicroTrustItem[]
  className?: string
}

export function MicroTrustRow({ items, className = '' }: Props) {
  if (items.length === 0) return null
  return (
    <ul
      className={`flex flex-wrap gap-x-6 gap-y-2 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70 ${className}`}
    >
      {items.map((item) => (
        <li
          key={item.label}
          className="inline-flex items-center gap-2 before:content-['•'] before:text-[var(--color-lj-brand)]"
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}
