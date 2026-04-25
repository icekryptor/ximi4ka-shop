import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Eyebrow({ children, className = '' }: Props) {
  return (
    <span
      className={`uppercase tracking-wider text-[length:var(--text-micro)] font-semibold text-[var(--color-brand)] ${className}`}
    >
      {children}
    </span>
  )
}
