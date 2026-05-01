import type { ReactNode, HTMLAttributes, CSSProperties } from 'react'

interface Props extends HTMLAttributes<HTMLElement> {
  variant: 'cream' | 'ink'
  children: ReactNode
}

export function LabSection({ variant, className = '', children, style, ...rest }: Props) {
  const palette =
    variant === 'cream'
      ? 'bg-[var(--color-lj-cream)] text-[var(--color-lj-ink)]'
      : 'bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)]'

  const proseColor =
    variant === 'cream' ? 'var(--color-lj-ink)' : 'var(--color-lj-bone)'

  const mergedStyle = {
    ...(style ?? {}),
    '--lj-prose-color': proseColor,
  } as CSSProperties

  return (
    <section
      className={`relative overflow-hidden ${palette} ${className}`.trim()}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </section>
  )
}
