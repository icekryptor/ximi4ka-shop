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
  // Дополнительные префиксы, при которых пункт считается активным. «Каталог»
  // ведёт на /catalog, но подсвечивается и на страницах категорий и товаров.
  match?: string[]
}

const NAV: NavItem[] = [
  { href: '/catalog', label: 'Каталог', desc: 'найти набор', match: ['/categories', '/product'] },
  { href: '/blog', label: 'Блог', desc: 'записи из лаборатории' },
  { href: '/o-nas', label: 'О нас', desc: 'наша лаборатория' },
  { href: '/dostavka', label: 'Доставка', desc: 'сроки и тарифы' },
  { href: '/kontakty', label: 'Контакты', desc: 'связь с нами' },
]

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/'
  const prefixes = [item.href, ...(item.match ?? [])]
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

interface HeaderProps {
  headerPromoText?: string | null
}

export function Header({ headerPromoText = null }: HeaderProps) {
  const pathnameRaw = usePathname()
  const { itemCount } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const pathname = pathnameRaw?.replace(/^\/(ru|en)(?=\/|$)/, '') || '/'

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

      {/* Шапка — плавающая пилюля в 10px от верхнего края. Сам <header>
          прозрачный и не ловит клики (отступ вокруг пилюли кликается насквозь),
          его высота вместе с отступом уходит в --lj-header-height. С lg пилюля
          шириной по содержимому и по центру — не растягивается на весь экран;
          уже — занимает всю ширину, чтобы корзина и «МЕНЮ» были у края.
          Навигация встаёт в ряд с lg, поле поиска — с xl: раньше логотип,
          пункты меню, поле и корзина в одну пилюлю не помещаются. */}
      <header
        ref={headerRef}
        className="pointer-events-none sticky top-0 z-[50] w-full px-2.5 pt-2.5"
      >
        <div
          data-testid="header-pill"
          className="pointer-events-auto mx-auto flex w-full items-center justify-between gap-4 lg:w-fit lg:max-w-full lg:justify-start lg:gap-8 rounded-full border border-[var(--color-lj-rule-soft)] bg-[var(--color-lj-cream)]/90 backdrop-blur shadow-[0_6px_24px_rgba(10,10,10,0.06)] py-2.5 pl-4 pr-3 md:pl-6 md:pr-2.5"
        >
          {/* На мобильном логотип (~199px при 1.75rem) — единственное, что
              может сжиматься: лупа, корзина и «МЕНЮ» вместе с ним не помещались
              в 390px и давали горизонтальный скролл. Высота остаётся прежней,
              сужается только ширина, знак масштабируется пропорционально. */}
          <Link
            href="/"
            aria-label="ХИМИЧКА — на главную"
            className="max-md:min-w-0 text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand-deep)] transition-colors"
          >
            <HeaderLogo size={1.75} className="max-md:max-w-full" />
          </Link>

          {/* Поиск по каталогу с живым превью — сразу за логотипом, как в
              макете. С xl поле встроено в ряд и сжимается первым, если пилюле
              не хватает ширины; уже — раскрывается по иконке-лупе (см. ниже). */}
          <div className="hidden xl:block w-[22rem] min-w-[9rem] shrink">
            <HeaderSearch />
          </div>

          <nav
            aria-label="Основная навигация"
            className="hidden lg:flex shrink-0 items-center gap-8"
          >
            {NAV.map((item) => {
              const active = isActive(pathname, item)
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

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {/* Иконка-лупа (до xl): раскрывает поле поиска отдельной плашкой. */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={mobileSearchOpen ? 'Скрыть поиск' : 'Открыть поиск'}
              aria-expanded={mobileSearchOpen}
              className="xl:hidden text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)] transition-colors"
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
              className="lg:hidden font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)]"
            >
              МЕНЮ
            </button>
          </div>
        </div>

        {/* Поиск до xl — отдельная плашка под пилюлей: второй ряд внутри
            rounded-full сломал бы форму. */}
        {mobileSearchOpen ? (
          <div
            data-testid="header-mobile-search"
            className="pointer-events-auto xl:hidden mt-2 lg:mx-auto lg:w-[24rem] rounded-3xl border border-[var(--color-lj-rule-soft)] bg-[var(--color-lj-cream)] shadow-[0_6px_24px_rgba(10,10,10,0.06)] px-4 py-3"
          >
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
