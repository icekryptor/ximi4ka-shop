'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { CartButton } from './CartButton'

interface NavItem {
  href: string
  label: string
}

const NAV: NavItem[] = [
  { href: '/', label: 'Главная' },
  { href: '/categories', label: 'Каталог' },
  { href: '/o-nas', label: 'О нас' },
  { href: '/dostavka', label: 'Доставка' },
  { href: '/kontakty', label: 'Контакты' },
]

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur border-b border-brand-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 py-4">
        <Link
          href="/"
          aria-label="Ximi4ka — на главную"
          className="text-2xl font-bold text-brand hover:text-brand-dark transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          Ximi4ka
        </Link>

        <nav
          aria-label="Основная навигация"
          className="hidden md:flex items-center gap-6"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'text-brand font-semibold'
                    : 'text-brand-text-secondary hover:text-brand-text transition-colors'
                }
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <CartButton />
          <button
            type="button"
            aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-full border border-brand-border text-brand-text"
          >
            <span aria-hidden className="text-xl leading-none">
              {mobileOpen ? '×' : '☰'}
            </span>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          aria-label="Мобильная навигация"
          className="md:hidden border-t border-brand-border bg-white"
        >
          <ul className="flex flex-col px-4 py-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={
                      active
                        ? 'block py-3 text-brand font-semibold'
                        : 'block py-3 text-brand-text-secondary hover:text-brand-text'
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
