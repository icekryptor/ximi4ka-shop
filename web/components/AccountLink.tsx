import Link from 'next/link'

// Иконка кабинета в шапке: всегда /account — вошёл ли покупатель, решает
// серверный layout кабинета, шапке это знать не нужно.
export function AccountLink() {
  return (
    <Link
      href="/account"
      aria-label="Личный кабинет"
      className="text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)] transition-colors"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="8" cy="5.5" r="3" />
        <path d="M2.5 14c.8-2.6 3-4 5.5-4s4.7 1.4 5.5 4" strokeLinecap="round" />
      </svg>
    </Link>
  )
}
