import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Container({ children, className = '' }: Props) {
  return (
    <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </div>
  )
}
