'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ADMIN_API_URL_CLIENT,
  readCsrfTokenFromDocument,
  type AdminUserPublic,
} from '@/lib/adminAuth'

interface Props {
  admin: AdminUserPublic
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  exact?: boolean
  /** Раздел только для роли admin (API закрыт для остальных, здесь лишь прячем пункт). */
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Главная', exact: true },
  { href: '/admin/products', label: 'Товары' },
  { href: '/admin/categories', label: 'Категории' },
  { href: '/admin/pages', label: 'Страницы' },
  { href: '/admin/blog', label: 'Блог' },
  { href: '/admin/orders', label: 'Заказы', adminOnly: true },
  { href: '/admin/redirects', label: 'Редиректы' },
  { href: '/admin/media', label: 'Медиа' },
  { href: '/admin/settings', label: 'Настройки', adminOnly: true },
]

function isActive(pathname: string | null, href: string, exact?: boolean): boolean {
  if (!pathname) return false
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({ admin, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const csrf = readCsrfTokenFromDocument()
      await fetch(`${ADMIN_API_URL_CLIENT}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      })
    } catch {
      // Network error — cookies may still be valid, but push to login anyway
      // so the user can retry from a known state.
    } finally {
      router.replace('/admin/login')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen bg-brand-bg-soft">
      <aside className="w-64 bg-white border-r border-brand-border flex flex-col">
        <div className="p-6 text-xl font-bold text-brand">Ximi4ka Admin</div>
        <nav aria-label="Админ навигация" className="px-3 flex-1">
          <ul className="flex flex-col gap-1">
            {NAV.filter((item) => !item.adminOnly || admin.role === 'admin').map((item) => {
              const active = isActive(pathname, item.href, item.exact)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'block px-3 py-2 rounded-lg bg-brand text-white font-semibold'
                        : 'block px-3 py-2 rounded-lg text-brand-text hover:bg-brand-bg-soft transition-colors'
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-brand-border px-6 flex items-center justify-between">
          <div className="text-sm text-brand-text-secondary truncate">
            {admin.email}
            <span className="ml-2 text-xs uppercase tracking-wide text-brand-text-secondary/70">
              {admin.role}
            </span>
          </div>
          <Link
            href="/admin/account"
            className="ml-auto mr-4 text-sm text-brand-text-secondary hover:text-brand-text"
          >
            Сменить пароль
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-sm text-brand-text-secondary hover:text-brand-text disabled:opacity-50"
          >
            {loggingOut ? 'Выход...' : 'Выйти'}
          </button>
        </header>
        {admin.mustChangePassword ? (
          <div
            role="status"
            className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800"
          >
            Используется пароль по умолчанию: он общеизвестен, и любой может войти в админку.{' '}
            <Link href="/admin/account" className="font-semibold underline">
              Сменить пароль
            </Link>
          </div>
        ) : null}
        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
