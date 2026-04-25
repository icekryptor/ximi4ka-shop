import type { ReactNode } from 'react'

type PillVariant =
  | 'solid-brand'
  | 'soft-brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'

interface Props {
  children: ReactNode
  variant?: PillVariant
  className?: string
}

const variantClass: Record<PillVariant, string> = {
  'solid-brand': 'bg-[var(--color-brand)] text-[var(--color-text-on-brand)]',
  'soft-brand': 'bg-[var(--color-brand-bg-soft)] text-[var(--color-brand)]',
  success: 'bg-[var(--color-stock-success-soft)] text-[var(--color-stock-success)]',
  warning: 'bg-[var(--color-stock-warning-soft)] text-[var(--color-stock-warning)]',
  danger: 'bg-[var(--color-stock-danger-soft)] text-[var(--color-stock-danger)]',
  neutral: 'bg-[var(--color-surface-soft)] text-[var(--color-brand-text-secondary)]',
}

export function Pill({ children, variant = 'neutral', className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[length:var(--text-micro)] font-medium ${variantClass[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
