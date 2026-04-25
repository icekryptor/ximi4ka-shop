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
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] ${className}`}>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          <span aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
