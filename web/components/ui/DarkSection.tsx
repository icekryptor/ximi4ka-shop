import type { ReactNode } from 'react'

type DarkSize = 'md' | 'lg'

interface Props {
  children: ReactNode
  size?: DarkSize
  glow?: boolean
  className?: string
  id?: string
  as?: 'section' | 'div' | 'header' | 'footer'
}

const sizeClass: Record<DarkSize, string> = {
  md: 'py-24',
  lg: 'py-32',
}

export function DarkSection({
  children,
  size = 'md',
  glow = false,
  className = '',
  id,
  as: Tag = 'section',
}: Props) {
  return (
    <Tag
      id={id}
      className={`relative overflow-hidden bg-[var(--color-dark-base)] text-[var(--color-text-on-dark)] ${sizeClass[size]} ${className}`}
    >
      {glow && (
        <div
          aria-hidden="true"
          data-dark-glow
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--gradient-dark-glow)' }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </Tag>
  )
}
