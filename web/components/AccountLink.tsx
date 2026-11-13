'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getMeOrNull } from '@/lib/accountApi'
import { avatarInitial, coinsWord, formatCoins } from '@/lib/coins'
import { hasSignedInCookie, setSignedInAttr } from '@/lib/signedInHint'
import { CoinIcon } from './CoinIcon'

// Иконка кабинета в шапке: всегда /account — вошёл ли покупатель, решает серверный
// layout кабинета. В разметке сразу оба варианта (человечек и аватарка с чипом);
// какой виден, решает CSS по html[data-signed-in] (его ставит статичный скрипт до
// первой отрисовки по читаемой CSRF-cookie). Гость запросов не делает.
// Логин/выход внутри SPA подхватываем при смене маршрута; баланс обновляется
// при следующей загрузке страницы.

interface Loaded {
  initial: string
  balance: number
}

export function AccountLink({
  coinsEnabled,
  onBalanceChange,
}: {
  coinsEnabled: boolean
  /** Баланс для строки в мобильном меню; null — гость или сессия протухла. */
  onBalanceChange?: (balance: number | null) => void
}) {
  const pathname = usePathname()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    const signedIn = hasSignedInCookie()
    setSignedInAttr(signedIn)
    if (signedIn && loadedRef.current) return
    let cancelled = false
    // Без cookie запроса нет: await лишь переносит setState из синхронного тела эффекта.
    void (async () => {
      const me = signedIn ? await getMeOrNull() : null
      if (cancelled) return
      if (signedIn && !me) setSignedInAttr(false) // сессия протухла — снова человечек
      const next = me
        ? { initial: avatarInitial(me.name, me.email), balance: me.coinBalance }
        : null
      loadedRef.current = next !== null
      setLoaded(next)
      onBalanceChange?.(next ? next.balance : null)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const showChip = coinsEnabled || (loaded?.balance ?? 0) > 0
  const label =
    loaded && showChip
      ? `Личный кабинет, баланс ${formatCoins(loaded.balance)} ${coinsWord(loaded.balance)}`
      : 'Личный кабинет'

  return (
    <Link
      href="/account"
      aria-label={label}
      title={label}
      className="relative inline-flex shrink-0 items-center text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)] transition-colors after:absolute after:-inset-3 after:content-['']"
    >
      <svg
        data-account-guest=""
        className="account-guest"
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
      <span
        data-account-user=""
        className="account-user shrink-0 items-center gap-1.5"
        aria-hidden="true"
      >
        <span className="inline-flex h-5 w-5 shrink-0 items-center xl:h-7 xl:w-7 justify-center rounded-full bg-[var(--color-lj-ink)] font-lj-mono text-[length:var(--text-lj-mono-sm)] leading-none text-[var(--color-lj-cream)]">
          {loaded?.initial ?? ''}
        </span>
        {showChip ? (
          <span
            data-account-chip=""
            className="hidden h-7 min-w-[calc(7ch+2.25rem)] items-center justify-center xl:inline-flex gap-1 whitespace-nowrap rounded-full border border-[var(--color-lj-rule)] px-2 font-lj-mono text-[length:var(--text-lj-mono-sm)] leading-none tabular-nums"
          >
            <CoinIcon />
            <span>{loaded ? formatCoins(loaded.balance) : ''}</span>
          </span>
        ) : null}
      </span>
    </Link>
  )
}
