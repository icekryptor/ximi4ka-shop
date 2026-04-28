'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { OPEN_CART_EVENT, useCart } from '@/lib/cart'
import { Ticker } from '@/components/ui'

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

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface HeaderProps {
  headerPromoText?: string | null
}

export function Header({ headerPromoText = null }: HeaderProps) {
  const pathnameRaw = usePathname()
  const { itemCount } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Strip locale prefix so /ru/categories matches the same active state as /categories.
  const pathname =
    pathnameRaw?.replace(/^\/(ru|en)(?=\/|$)/, '') || '/'

  const promoItems = headerPromoText
    ? headerPromoText
        .split(/[,·•|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const showPromo = promoItems.length > 0

  function openCart() {
    window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))
  }

  return (
    <>
      {showPromo ? (
        <div role="region" aria-label="Промо">
          <Ticker surface="dark" items={promoItems} />
        </div>
      ) : null}

      <header className="sticky top-0 z-30 w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 py-4">
          <Link
            href="/"
            aria-label="Ximi4ka — на главную"
            className="font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-extrabold tracking-[var(--tracking-tight)] text-[var(--color-brand-text)] hover:text-[var(--color-brand)] transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Ximi4ka
          </Link>

          <LayoutGroup id="header-nav">
            <nav
              aria-label="Основная навигация"
              className="hidden md:flex items-center gap-8"
            >
              {NAV.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative text-[length:var(--text-small)] font-medium transition-colors ${
                      active
                        ? 'text-[var(--color-lj-brand)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-brand-text)]'
                    }`}
                  >
                    {item.label}
                    {active ? (
                      <motion.span
                        layoutId="header-active-underline"
                        className="absolute -bottom-1 left-0 right-0 h-[2px] bg-[var(--color-lj-brand)]"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    ) : null}
                  </Link>
                )
              })}
            </nav>
          </LayoutGroup>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCart}
              aria-label="Открыть корзину"
              className="relative inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-soft)] px-4 py-2 text-[length:var(--text-small)] font-medium text-[var(--color-brand-text)] transition hover:bg-[var(--color-surface-elevated)] hover:shadow-[var(--shadow-md)]"
            >
              <span aria-hidden="true">🛒</span>
              <span>Корзина</span>
              {itemCount > 0 ? (
                <motion.span
                  data-testid="cart-badge"
                  key={itemCount}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 text-[length:var(--text-micro)] font-semibold text-[var(--color-text-on-brand)]"
                >
                  {itemCount}
                </motion.span>
              ) : null}
            </button>

            {!mobileOpen ? (
              <button
                type="button"
                aria-label="Открыть меню"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-full text-[var(--color-brand-text)] hover:bg-[var(--color-surface-soft)] transition-colors"
              >
                <span aria-hidden className="text-xl leading-none">☰</span>
              </button>
            ) : null}
          </div>
        </div>

        {mobileOpen ? (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              aria-hidden="true"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <div className="absolute right-0 top-0 h-full w-72 bg-[var(--color-surface-glass)] backdrop-blur-md border-l border-[var(--color-border-subtle)] flex flex-col shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <span className="font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-extrabold tracking-[var(--tracking-tight)] text-[var(--color-brand-text)]">
                  Меню
                </span>
                <button
                  type="button"
                  aria-label="Закрыть меню"
                  onClick={() => setMobileOpen(false)}
                  className="w-10 h-10 inline-flex items-center justify-center rounded-full text-[var(--color-brand-text)] hover:bg-[var(--color-surface-soft)]"
                >
                  <span aria-hidden className="text-xl leading-none">×</span>
                </button>
              </div>
              <nav
                aria-label="Мобильная навигация"
                className="flex flex-col"
              >
                {NAV.map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-4 text-[length:var(--text-body,1rem)] transition-colors ${
                        active
                          ? 'text-[var(--color-lj-brand)] bg-[var(--color-surface-soft)]'
                          : 'text-[var(--color-brand-text)] hover:bg-[var(--color-surface-soft)]'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        ) : null}
      </header>
    </>
  )
}
