import Link from 'next/link'
import { Eyebrow } from './Eyebrow'

interface Props {
  title: string
  eyebrow?: string
  action?: { label: string; href: string }
  as?: 'h2' | 'h3'
  className?: string
}

export function SectionHeading({ title, eyebrow, action, as: Tag = 'h2', className = '' }: Props) {
  return (
    <div className={`mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="flex flex-col gap-2">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Tag className="font-display tracking-[var(--tracking-tight)] leading-[var(--leading-tight)] text-[length:var(--text-h2)] text-[var(--color-brand-text)]">
          {title}
        </Tag>
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-sm font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-dark)]"
        >
          {action.label} →
        </Link>
      )}
    </div>
  )
}
