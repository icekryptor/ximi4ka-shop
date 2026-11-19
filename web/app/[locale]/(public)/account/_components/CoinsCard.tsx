'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { AccountCoins } from '@ximi4ka-shop/shared'
import { getCoins } from '@/lib/accountApi'
import { coinOperationLabel, coinsWord, formatCoins, formatSignedCoins } from '@/lib/coins'
import { CoinIcon } from '@/components/CoinIcon'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const CARD_CLASS =
  'flex min-h-[10rem] flex-col gap-4 rounded-2xl border border-[var(--color-lj-rule)] bg-white px-5 py-4'

interface Props {
  /** Включена ли программа (публичные настройки). Выключена и пусто — карточки нет. */
  programEnabled: boolean
}

// Химикоины в кабинете: баланс, ожидающее начисление, последние операции.
export function CoinsCard({ programEnabled }: Props) {
  const [data, setData] = useState<AccountCoins | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setData(await getCoins())
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    // Через queueMicrotask, как в OrdersList: setState внутри load — отдельным проходом.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  if (data === null) {
    if (!programEnabled) return null
    if (failed) {
      return (
        <section aria-labelledby="account-coins-heading" className={CARD_CLASS}>
          <h2
            id="account-coins-heading"
            className="m-0 font-lj-display font-[900] text-2xl tracking-[-0.03em] text-[var(--color-lj-ink)]"
          >
            Химикоины
          </h2>
          <p role="alert" className={ERROR_CLASS}>
            Не удалось загрузить химикоины.
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Повторить
            </Button>
          </div>
        </section>
      )
    }
    return (
      <div
        data-testid="coins-skeleton"
        aria-hidden="true"
        className={`${CARD_CLASS} animate-pulse bg-white/60`}
      />
    )
  }

  const empty = data.balance === 0 && data.pending === 0 && data.transactions.length === 0
  if (empty && !programEnabled) return null

  return (
    <section aria-labelledby="account-coins-heading" className={CARD_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2
            id="account-coins-heading"
            className="m-0 font-lj-display font-[900] text-2xl tracking-[-0.03em] text-[var(--color-lj-ink)]"
          >
            Химикоины
          </h2>
          <p className="m-0 flex items-baseline gap-2">
            <span className="inline-flex items-center gap-2 self-center">
              <CoinIcon size={22} />
            </span>
            <span
              data-testid="coins-balance"
              className="font-lj-display font-[900] text-4xl tracking-[-0.03em] text-[var(--color-lj-ink)]"
            >
              {formatCoins(data.balance)}
            </span>
            <span className="text-sm opacity-70">{coinsWord(data.balance)}</span>
          </p>
          {data.pending > 0 && (
            <p className="m-0 text-sm opacity-70">
              Ожидает начисления: {formatCoins(data.pending)}
            </p>
          )}
        </div>
        {/* Страница правил при выключенной программе отдаёт 404 — ссылку не показываем. */}
        {programEnabled && (
          <Link
            href="/himikoiny"
            className="text-sm text-[var(--color-brand)] underline underline-offset-4 hover:text-[var(--color-brand-dark)]"
          >
            Правила программы
          </Link>
        )}
      </div>

      {data.transactions.length === 0 ? (
        <p className="m-0 text-sm opacity-70">Химикоины придут после получения первого заказа</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {data.transactions.map((t) => (
            <li
              key={t.id}
              className="flex items-baseline justify-between gap-4 border-t border-[var(--color-lj-rule)] py-2 first:border-t-0"
            >
              <span className="flex flex-col">
                <span>{coinOperationLabel(t.kind, t.orderNumber)}</span>
                <span className="text-sm opacity-60">{DATE.format(new Date(t.createdAt))}</span>
              </span>
              <span className="font-lj-mono font-[700] whitespace-nowrap">
                {formatSignedCoins(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
