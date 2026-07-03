import type { ReactNode } from 'react'

export interface MicroTrustItem {
  /**
   * Optional icon (emoji, SVG, or any ReactNode). When provided it is
   * rendered before the label. When omitted, MicroTrustRow falls back
   * to a brand-purple `•` bullet via a `before:` pseudo-element. This
   * keeps cart's emoji trust signals (`🛡️🚚↩️`) visible while letting
   * the v3 product detail hero use the lab-journal bullet style.
   */
  icon?: ReactNode
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
      className={`flex flex-wrap gap-x-6 gap-y-2 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70 ${className}`.trim()}
    >
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          className={
            item.icon
              ? 'inline-flex items-center gap-2'
              : "inline-flex items-center gap-2 before:content-['•'] before:text-[var(--color-lj-brand)]"
          }
        >
          {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
          {item.label}
        </li>
      ))}
    </ul>
  )
}
