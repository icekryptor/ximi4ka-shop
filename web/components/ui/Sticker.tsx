import type { ReactNode } from 'react'

type StickerVariant = 'accent' | 'brand' | 'dark' | 'success'

interface Props {
  children: ReactNode
  variant?: StickerVariant
  wobble?: boolean
  className?: string
}

const variantClass: Record<StickerVariant, string> = {
  accent: 'bg-[var(--color-accent)] text-white',
  brand: 'bg-[var(--gradient-brand-deep)] text-[var(--color-text-on-brand)]',
  dark: 'bg-[var(--color-dark-base)] text-[var(--color-text-on-dark)]',
  success: 'bg-[var(--color-stock-success)] text-white',
}

export function Sticker({
  children,
  variant = 'accent',
  wobble = false,
  className = '',
}: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[length:var(--text-micro)] font-bold uppercase tracking-wider shadow-[var(--shadow-md)] -rotate-3 ${variantClass[variant]} ${wobble ? 'animate-sticker-wobble' : ''} ${className}`}
    >
      {children}
    </span>
  )
}
