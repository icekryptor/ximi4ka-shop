import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  as?: 'h1' | 'h2'
  className?: string
}

export function DisplayHeading({ children, as: Tag = 'h1', className = '' }: Props) {
  return (
    <Tag
      className={`font-display tracking-[var(--tracking-tight)] leading-[var(--leading-tight)] text-[length:var(--text-display)] text-[var(--color-brand-text)] ${className}`}
    >
      {children}
    </Tag>
  )
}
