'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getMeSession } from '@/lib/accountApi'
import { avatarInitial, coinsWord, formatCoins } from '@/lib/coins'
import { expireSignedInCookie, setSignedInAttr, signedInCookieValue } from '@/lib/signedInHint'
import { CoinIcon } from './CoinIcon'

// Иконка кабинета в шапке: всегда /account — вошёл ли покупатель, решает серверный
// layout кабинета. Программа включена: в разметке сразу оба варианта (человечек и
// аватарка с чипом); какой виден, решает CSS по html[data-signed-in] внутри
// [data-coins] (атрибут ставит статичный скрипт до первой отрисовки по читаемой
// CSRF-cookie). Гость запросов не делает. Программа выключена: только человечек,
// как до запуска химикоинов, и никаких запросов.
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
  // Значение cookie, которое мы уже проверяли за время жизни страницы (успешно или
  // со сбоем): без этого каждая навигация повторяла бы запрос /me.
  const checkedRef = useRef<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    // Программа выключена: шапка как раньше — человечек для всех, без запросов.
    if (!coinsEnabled) return
    const cookie = signedInCookieValue()
    setSignedInAttr(cookie !== null)
    if (cookie !== null && checkedRef.current === cookie) return
    checkedRef.current = cookie
    // Без cookie запроса нет: await лишь переносит setState из синхронного тела эффекта.
    void (async () => {
      const result = cookie !== null ? await getMeSession() : null
      if (!aliveRef.current) return
      if (result?.status === 'error') return // сбой: подсказку не трогаем, повторять не будем
      if (result?.status === 'unauthorized') {
        // Сессии нет, а cookie осталась: снимаем её, следующая загрузка — чистый гость.
        expireSignedInCookie()
        setSignedInAttr(false)
      }
      const next =
        result?.status === 'ok'
          ? {
              initial: avatarInitial(result.me.name, result.me.email),
              balance: result.me.coinBalance,
            }
          : null
      setLoaded(next)
      onBalanceChange?.(next ? next.balance : null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, coinsEnabled])

  const label = loaded
    ? `Личный кабинет, баланс ${formatCoins(loaded.balance)} ${coinsWord(loaded.balance)}`
    : 'Личный кабинет'

  return (
    <Link
      href="/account"
      aria-label={label}
      title={label}
      data-coins={coinsEnabled ? '' : undefined}
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
      {coinsEnabled ? (
        <span
          data-account-user=""
          className="account-user shrink-0 items-center gap-1.5"
          aria-hidden="true"
        >
          <span className="inline-flex h-5 w-5 shrink-0 items-center xl:h-7 xl:w-7 justify-center rounded-full bg-[var(--color-lj-ink)] font-lj-mono text-[length:var(--text-lj-mono-sm)] leading-none text-[var(--color-lj-cream)]">
            {loaded?.initial ?? ''}
          </span>
          <span
            data-account-chip=""
            className="hidden h-7 min-w-[calc(7ch+2.25rem)] items-center justify-center xl:inline-flex gap-1 whitespace-nowrap rounded-full border border-[var(--color-lj-rule)] px-2 font-lj-mono text-[length:var(--text-lj-mono-sm)] leading-none tabular-nums"
          >
            <CoinIcon />
            <span>{loaded ? formatCoins(loaded.balance) : ''}</span>
          </span>
        </span>
      ) : null}
    </Link>
  )
}
