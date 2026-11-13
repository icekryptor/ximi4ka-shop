'use client'

import { cashbackCoins } from '@ximi4ka-shop/shared/types/coins'
import type { CartTotals } from '@/lib/cart'
import { useCoinsProgram } from '@/lib/useCoinsProgram'
import { CartSummaryRows } from './CartSummaryRows'

interface Props {
  totals: CartTotals
  itemCount: number
  /** Сумма товаров, с которой считается кэшбек; по умолчанию totals.totalRub (на чекауте — за вычетом промо). */
  cashbackBaseRub?: number
  /** undefined — подсказка по cookie; null — страница ещё выясняет (строки нет); boolean — известно. */
  signedIn?: boolean | null
}

/** CartSummaryRows + строка кэшбека. Хук живёт здесь, чтобы закрытая выезжающая корзина не ходила за настройками. */
export function CartSummaryWithCashback({ totals, itemCount, cashbackBaseRub, signedIn }: Props) {
  const program = useCoinsProgram()
  const known = signedIn !== null
  const coins =
    program.percent === null
      ? 0
      : cashbackCoins(cashbackBaseRub ?? totals.totalRub, program.percent)
  const cashback =
    known && coins > 0 ? { coins, signedIn: signedIn ?? program.signedIn } : undefined
  return <CartSummaryRows totals={totals} itemCount={itemCount} cashback={cashback} />
}
