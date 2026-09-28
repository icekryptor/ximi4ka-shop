// Оптовые скидки на наборы (решение владельца, 27.09.2026): скидка в рублях
// с каждого набора, ступень — по количеству наборов группы в заказе.
// Химичка 3.0 и Электрохимичка считаются вместе, у Мини-Химички своя шкала.
// Комбо и прочие товары в акции не участвуют.
//
// Зеркало — web/lib/wholesale.ts (API не импортирует рантайм из shared,
// как и SHIPPING_RULES). Правишь здесь — поправь там; тесты с обеих сторон
// проверяют одни и те же ступени.
export interface WholesaleGroup {
  slugs: readonly string[]
  /** По убыванию порога: первая подходящая ступень выигрывает. */
  tiers: readonly { minQty: number; offRub: number }[]
}

export const WHOLESALE_GROUPS: readonly WholesaleGroup[] = [
  {
    slugs: ['himichka-30', 'elektrohimichka'],
    tiers: [
      { minQty: 50, offRub: 599 },
      { minQty: 20, offRub: 499 },
      { minQty: 10, offRub: 399 },
      { minQty: 5, offRub: 299 },
    ],
  },
  {
    slugs: ['mini-himichka'],
    tiers: [
      { minQty: 50, offRub: 499 },
      { minQty: 20, offRub: 399 },
      { minQty: 10, offRub: 299 },
      { minQty: 5, offRub: 199 },
    ],
  },
]

export interface WholesaleLine {
  slug: string
  quantity: number
  priceRub: number
}

/** Скидка в рублях на одну штуку для каждого слага из корзины (0 — без скидки). */
export function wholesaleUnitDiscounts(lines: readonly WholesaleLine[]): Map<string, number> {
  const result = new Map<string, number>(lines.map((l) => [l.slug, 0]))
  for (const group of WHOLESALE_GROUPS) {
    const inGroup = lines.filter((l) => group.slugs.includes(l.slug))
    const qty = inGroup.reduce((sum, l) => sum + l.quantity, 0)
    const tier = group.tiers.find((t) => qty >= t.minQty)
    if (!tier) continue
    for (const l of inGroup) {
      // Цена за штуку не опускается ниже 1 ₽, даже если набор подешевеет.
      result.set(l.slug, Math.min(tier.offRub, Math.max(0, l.priceRub - 1)))
    }
  }
  return result
}
