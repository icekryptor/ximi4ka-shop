'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { LabSection } from '@/components/ui/LabSection'
import { GridOverlay } from '@/components/ui/GridOverlay'

interface NavItem {
  href: string
  label: string
  desc?: string
  match?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  pathname: string
  navItems: NavItem[]
  cartCount: number
}

export function MobileMenuOverlay({ open, onClose, pathname, navItems, cartCount }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  const isActive = (item: NavItem) => {
    if (item.href === '/') return pathname === '/'
    const prefixes = [item.href, ...(item.match ?? [])]
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Меню" className="fixed inset-0 z-[60]">
      <LabSection variant="cream" className="h-full overflow-y-auto px-6 pt-6 pb-12">
        <GridOverlay />
        <div className="relative z-[2]">
          <div className="flex items-center justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] mb-12">
            <span className="inline-flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lj-brand)]" />
              № MENU — Меню
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть меню"
              className="font-lj-mono hover:text-[var(--color-lj-brand-deep)]"
            >
              × закрыть
            </button>
          </div>

          <ul className="list-none p-0 m-0 flex flex-col gap-0">
            {navItems.map((item, i) => {
              const active = isActive(item)
              return (
                <li key={item.href} className="border-b border-[var(--color-lj-rule)] py-6">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-3"
                  >
                    <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65">
                      {pad(i + 1)} /
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className={`font-lj-display font-[700] text-[2rem] leading-none tracking-[-0.035em] ${active ? 'text-[var(--color-lj-brand)]' : ''}`}>
                        {item.label}
                      </span>
                      {item.desc && (
                        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65">
                          {item.desc}
                        </span>
                      )}
                    </div>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lj-brand)] mt-3" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>

          <Link
            href="/cart"
            onClick={onClose}
            className={`block mt-12 mb-6 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] ${cartCount > 0 ? 'text-[var(--color-lj-brand)]' : ''}`}
          >
            {cartCount > 0 ? `КОРЗИНА · ${cartCount} →` : 'КОРЗИНА (0) →'}
          </Link>

          <div className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65 flex flex-wrap gap-x-3 gap-y-1">
            <span>telegram</span>
            <span className="text-[var(--color-lj-brand)]">·</span>
            <span>whatsapp</span>
            <span className="text-[var(--color-lj-brand)]">·</span>
            <span>phone</span>
          </div>
        </div>
      </LabSection>
    </div>
  )
}
