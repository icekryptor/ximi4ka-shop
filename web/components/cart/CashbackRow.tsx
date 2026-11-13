'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CoinIcon } from '@/components/CoinIcon'
import { coinsWord, formatCoins } from '@/lib/coins'

interface Props {
  coins: number
  signedIn: boolean
}

/**
 * Будущий кэшбек в итогах корзины: справочная строка, не скидка и не часть суммы —
 * поэтому приглушённая, без цвета цен. Нет начисления — нет строки.
 */
export function CashbackRow({ coins, signedIn }: Props) {
  const pathname = usePathname()
  if (!(coins > 0)) return null
  const amount = `${formatCoins(coins)} ${coinsWord(coins)}`
  const loginHref = pathname
    ? `/account/login?next=${encodeURIComponent(pathname)}`
    : '/account/login'
  return (
    <div
      data-testid="summary-cashback"
      className="flex items-center gap-1.5 font-lj-mono text-[length:var(--text-lj-mono-sm)] tracking-[0.02em]"
    >
      <span className="inline-flex items-center gap-1.5 opacity-70">
        <CoinIcon size={14} />
        <span>
          {signedIn ? (
            `Вернём ${amount}`
          ) : (
            <>
              <Link href={loginHref} className="underline underline-offset-2">
                Войдите
              </Link>
              {`, чтобы получить ${amount}`}
            </>
          )}
        </span>
      </span>
      <Link
        href="/himikoiny"
        aria-label="Правила программы"
        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none no-underline after:absolute after:-inset-1 after:content-['']"
      >
        i
      </Link>
    </div>
  )
}
