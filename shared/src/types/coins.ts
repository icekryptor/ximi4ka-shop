// Химикоины: баланс покупателя и кэшбек за оплаченные заказы. 1 химикоин = 1 ₽.
// Все суммы — целые; кэшбек округляется вниз. Файл самодостаточный (без импортов):
// потребители берут его по подпути @ximi4ka-shop/shared/types/coins.
export const DEFAULT_CASHBACK_PERCENT = 10

export type CoinTransactionKind = 'order_cashback' | 'order_cashback_revoke' | 'admin_adjust'

/** Кэшбек в целых химикоинах: сумма товаров вниз до рубля, затем процент вниз. */
export function cashbackCoins(goodsPaidRub: number, percent: number): number {
  const goods = Math.floor(goodsPaidRub)
  if (goods <= 0 || percent <= 0) return 0
  return Math.floor((goods * percent) / 100)
}

/** Публичные настройки программы кэшбека. */
export interface PublicCoins {
  cashbackPercent: number
}
