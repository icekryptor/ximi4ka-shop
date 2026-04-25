import type { ReactNode } from 'react'

type SectionSize = 'sm' | 'md' | 'lg'
type SectionSurface = 'base' | 'soft' | 'glass' | 'gradient'

interface Props {
  children: ReactNode
  size?: SectionSize
  surface?: SectionSurface
  className?: string
  as?: 'section' | 'div' | 'header' | 'footer'
}

const sizeClass: Record<SectionSize, string> = {
  sm: 'py-8',
  md: 'py-16',
  lg: 'py-24',
}

const surfaceClass: Record<SectionSurface, string> = {
  base: 'bg-[var(--color-surface-base)]',
  soft: 'bg-[var(--color-surface-soft)]',
  glass: 'bg-[var(--color-surface-glass)] backdrop-blur-md',
  gradient: 'bg-[var(--gradient-brand)] text-[var(--color-text-on-brand)]',
}

export function Section({
  children,
  size = 'md',
  surface = 'base',
  className = '',
  as: Tag = 'section',
}: Props) {
  return (
    <Tag className={`${sizeClass[size]} ${surfaceClass[surface]} ${className}`}>
      {children}
    </Tag>
  )
}
