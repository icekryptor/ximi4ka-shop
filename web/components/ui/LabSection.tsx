import type { ReactNode, HTMLAttributes } from 'react'

// v3 primitives are unopinionated about padding/tag and never accept `as` —
// composition belongs to NotebookHeader / Container / consumer markup.
interface Props extends HTMLAttributes<HTMLElement> {
  variant: 'cream' | 'ink'
  children: ReactNode
}

export function LabSection({ variant, className = '', children, ...rest }: Props) {
  const palette =
    variant === 'cream'
      ? 'bg-[var(--color-lj-cream)] text-[var(--color-lj-ink)]'
      : 'bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)]'
  return (
    <section
      className={`relative overflow-hidden ${palette} ${className}`.trim()}
      {...rest}
    >
      {children}
    </section>
  )
}
