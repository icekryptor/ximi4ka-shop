// Промокоды. Пока один код зашит здесь, позже коды переедут в таблицу и админку.
// Скидка берётся с суммы товаров после оптовых скидок; доставка и порог бесплатной
// доставки считаются от суммы ДО промокода. Единый источник для api и web.
export interface Promo {
  code: string
  percent: number
}

const PROMOS: Record<string, Promo> = {
  RENATA2026: { code: 'RENATA2026', percent: 5 },
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function findPromo(raw: string): Promo | null {
  const code = normalizePromoCode(raw)
  return Object.hasOwn(PROMOS, code) ? PROMOS[code] : null
}

/** Скидка в целых рублях: процент от суммы товаров, не больше самой суммы. */
export function promoDiscountRub(goodsRub: number, percent: number): number {
  if (goodsRub <= 0) return 0
  return Math.min(goodsRub, Math.round((goodsRub * percent) / 100))
}
