import type { ReactNode } from 'react'

interface Props { children: ReactNode }

/**
 * Lab-journal chip pill. Inverts on parent card hover via Tailwind 4 group:
 * parent must be `<article className="group/pcard …">` for the hover invert
 * to fire — see ProductCard.
 */
export function Chip({ children }: Props) {
  return (
    <span className="inline-flex items-center px-3 py-1.5 border border-[var(--color-lj-ink)] rounded-full font-lj-mono text-[0.6875rem] lowercase tracking-[0.04em] text-[var(--color-lj-ink)] bg-transparent transition-[background,color] duration-400 group-hover/pcard:bg-[var(--color-lj-ink)] group-hover/pcard:text-[var(--color-lj-bone)]">
      {children}
    </span>
  )
}
