import Link from 'next/link'
import type { ReactNode, MouseEventHandler } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface BaseProps {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  className?: string
}

interface ButtonAsButton extends BaseProps {
  href?: undefined
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
}

interface ButtonAsLink extends BaseProps {
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  type?: never
}

type Props = ButtonAsButton | ButtonAsLink

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--gradient-brand)] text-[var(--color-text-on-brand)] shadow-[var(--shadow-glow-brand)] hover:opacity-95',
  secondary:
    'border border-[var(--color-border-strong)] bg-transparent text-[var(--color-brand-text)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]',
  ghost:
    'bg-transparent text-[var(--color-brand-text)] hover:bg-[var(--color-surface-soft)]',
  link:
    'bg-transparent text-[var(--color-brand)] underline underline-offset-4 hover:text-[var(--color-brand-dark)]',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-2.5 text-base',
  lg: 'px-8 py-3 text-base',
  xl: 'px-10 py-4 text-lg',
}

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

function Spinner() {
  return (
    <svg
      aria-label="Загрузка"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button(props: Props) {
  const {
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    disabled = false,
    loading = false,
    className = '',
  } = props

  const classes = `${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} ${className}`

  const content = loading ? <Spinner /> : children

  if ('href' in props && props.href !== undefined) {
    return (
      <Link
        href={props.href}
        className={classes}
        onClick={props.onClick}
        aria-disabled={disabled || loading || undefined}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type={props.type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      onClick={(props as ButtonAsButton).onClick}
    >
      {content}
    </button>
  )
}
