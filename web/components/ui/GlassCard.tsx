import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function GlassCard({ children, className = '' }: Props) {
  return (
    <div
      className={`bg-[var(--color-surface-glass)] backdrop-blur-md rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] shadow-[var(--shadow-md)] p-6 ${className}`}
    >
      {children}
    </div>
  )
}
