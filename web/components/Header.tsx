'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useCart } from '@/lib/cart'
import { Ticker } from '@/components/ui'
import { CartButton } from './CartButton'
import { HeaderLogo } from './HeaderLogo'
import { MobileMenuOverlay } from './MobileMenuOverlay'
import { HeaderSearch } from './search/HeaderSearch'

interface NavItem {
  href: string
  label: string
  desc: string
}

const NAV: NavItem[] = [
  { href: '/categories', label: 'Каталог', desc: 'найти набор' },
  { href: '/blog', label: 'Блог', desc: 'записи из лаборатории' },
  { href: '/o-nas', label: 'О нас', desc: 'наша лаборатория' },
  { href: '/dostavka', label: 'Доставка', desc: 'сроки и тарифы' },
  { href: '/kontakty', label: 'Контакты', desc: 'связь с нами' },
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const pathname =
    pathnameRaw?.replace(/^\/(ru|en)(?=\/|$)/, '') || '/'

  const promoItems = headerPromoText
    ? headerPromoText
        .split(/[,·•|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const showPromo = promoItems.length > 0

  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const update = () => {
      const h = el.getBoundingClientRect().height
      document.documentElement.style.setProperty('--lj-header-height', `${h}px`)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <>
      {showPromo ? (
        <div role="region" aria-label="Промо">
          <Ticker surface="dark" items={promoItems} />
        </div>
      ) : null}

      <header
        ref={headerRef}
        className="sticky top-0 z-[50] w-full border-b border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)]/95 backdrop-blur"
      >
        <div className="max-w-[var(--max-lj-content)] mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            aria-label="ХИМИЧКА — на главную"
            className="text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand-deep)] transition-colors"
          >
            <HeaderLogo size={1.75} />
          </Link>

          <nav
            aria-label="Основная навигация"
            className="hidden md:flex items-center gap-6 lg:gap-8"
          >
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] transition-colors ${
                    active
                      ? 'text-[var(--color-lj-brand)]'
                      : 'text-[var(--color-lj-ink)] opacity-70 hover:opacity-100'
                  }`}
                >
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1 left-0 right-0 h-[2px] bg-[var(--color-lj-brand)]"
                    />
                  ) : null}
                </Link>
              )
            })}
          </nav>

          {/* Поиск по каталогу с живым превью — между навигацией и корзиной.
              На десктопе поле встроено в ряд; на мобильном раскрывается по
              иконке-лупе (см. ниже). */}
          <div className="hidden md:block flex-1 max-w-[22rem] mx-2">
            <HeaderSearch />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Мобильная иконка-лупа: раскрывает поле поиска отдельным рядом. */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={mobileSearchOpen ? 'Скрыть поиск' : 'Открыть поиск'}
              aria-expanded={mobileSearchOpen}
              className="md:hidden text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)] transition-colors"
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
                <circle cx="7" cy="7" r="4.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
              </svg>
            </button>

            {/* Кнопка корзины видна ВСЕГДА (и на мобильном) и открывает
                CartDrawer мгновенно — навигация на /cart только из drawer. */}
            <CartButton />

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
              className="md:hidden font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)]"
            >
              МЕНЮ
            </button>
          </div>
        </div>

        {/* Мобильный ряд поиска — во всю ширину под верхней панелью. */}
        {mobileSearchOpen ? (
          <div className="md:hidden border-t border-[var(--color-lj-rule)] px-6 py-3">
            <div className="[&>div]:max-w-none">
              <HeaderSearch />
            </div>
          </div>
        ) : null}
      </header>

      <MobileMenuOverlay
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pathname={pathname}
        navItems={NAV}
        cartCount={itemCount}
      />
    </>
  )
}
