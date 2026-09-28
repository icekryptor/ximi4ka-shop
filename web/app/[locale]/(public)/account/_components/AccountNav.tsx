'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/lib/i18n'

const TABS = [
  { href: '/account', label: 'Заказы' },
  { href: '/account/profile', label: 'Личные данные' },
]

// usePathname может прийти с префиксом непустой локали (/en/account) — снимаем
// его. RU — локаль по умолчанию и в URL не участвует, поэтому регулярка
// строится из всех локалей, кроме неё (сейчас это только `en`).
const NON_DEFAULT_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)
const LOCALE_PREFIX_RE =
  NON_DEFAULT_LOCALES.length > 0
    ? new RegExp(`^/(?:${NON_DEFAULT_LOCALES.join('|')})(?=/|$)`)
    : null

function isActive(pathname: string, href: string): boolean {
  const path = (LOCALE_PREFIX_RE ? pathname.replace(LOCALE_PREFIX_RE, '') : pathname) || '/'
  return href === '/account' ? path === '/account' : path.startsWith(href)
}

// Вкладки: слева на десктопе, строкой сверху на мобильном.
export function AccountNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Разделы кабинета" className="flex lg:flex-col gap-2">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-4 py-2 font-lj-mono uppercase tracking-[0.06em] text-[length:var(--text-lj-mono-sm)] ${
              active
                ? 'bg-[var(--color-lj-ink)] text-[var(--color-lj-cream)]'
                : 'text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)]'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
