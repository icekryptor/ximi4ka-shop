import type { ReactNode } from 'react'

interface Props { children: ReactNode; className?: string }

export function Bleed({ children, className = '' }: Props) {
  return (
    <div className={`-mx-4 sm:-mx-8 lg:-mx-12 ${className}`}>
      {children}
    </div>
  )
}
