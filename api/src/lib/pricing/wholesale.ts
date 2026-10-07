// Оптовые скидки (решения владельца, 27.09.2026 и 07.10.2026):
// — наборы: скидка в рублях с каждого набора, ступень — по количеству именно
//   этого набора в заказе (наборы не складываются; для совместных заказов
//   есть комбо); у Мини-Химички своя шкала;
// — реагенты и оборудование: процент на позицию по её количеству;
// — пробирки и пипетки: цена всей партии по таблице.
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

const KIT_TIERS: WholesaleGroup['tiers'] = [
  { minQty: 50, offRub: 599 },
  { minQty: 20, offRub: 499 },
  { minQty: 10, offRub: 399 },
  { minQty: 5, offRub: 299 },
]

const MINI_TIERS: WholesaleGroup['tiers'] = [
  { minQty: 50, offRub: 499 },
  { minQty: 20, offRub: 399 },
  { minQty: 10, offRub: 299 },
  { minQty: 5, offRub: 199 },
]

// Одна группа — один набор: ступень зависит только от его количества.
// Шкалы Химички, Электро и ОГЭ — один и тот же массив (по нему страница /opt
// сводит их в одну строку таблицы).
export const WHOLESALE_GROUPS: readonly WholesaleGroup[] = [
  { slugs: ['himichka-30'], tiers: KIT_TIERS },
  { slugs: ['elektrohimichka'], tiers: KIT_TIERS },
  { slugs: ['bolshoi-nabor-dlya-oge'], tiers: KIT_TIERS },
  { slugs: ['mini-himichka'], tiers: MINI_TIERS },
]

export interface WholesaleLine {
  slug: string
  quantity: number
  priceRub: number
  /** Слаги категорий товара; по ним определяется процентная скидка. */
  categories?: readonly string[]
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

/** Процентная скидка реагентов и оборудования; по убыванию порога. */
export const PERCENT_TIERS: readonly { minQty: number; percent: number }[] = [
  { minQty: 50, percent: 30 },
  { minQty: 20, percent: 25 },
  { minQty: 10, percent: 20 },
  { minQty: 5, percent: 15 },
]

/** Категории, на которые действует процентная скидка. */
export const PERCENT_CATEGORIES: readonly string[] = ['reagents', 'equipment']

export interface BatchPricing {
  /** Цена всей партии на точном количестве, по возрастанию qty. */
  steps: readonly { qty: number; totalRub: number }[]
  /** Цена каждой штуки сверх последней ступени. */
  extraUnitRub: number
}

// Map, а не объект: слаг вроде `constructor` не должен находить чужое правило.
export const BATCH_PRICING: ReadonlyMap<string, BatchPricing> = new Map<string, BatchPricing>([
  [
    'probirka',
    {
      steps: [
        { qty: 2, totalRub: 39 },
        { qty: 5, totalRub: 99 },
        { qty: 10, totalRub: 169 },
        { qty: 20, totalRub: 299 },
      ],
      extraUnitRub: 14,
    },
  ],
  [
    'pipetka-pastera',
    {
      steps: [
        { qty: 2, totalRub: 29 },
        { qty: 5, totalRub: 69 },
        { qty: 10, totalRub: 119 },
        { qty: 20, totalRub: 199 },
      ],
      extraUnitRub: 9,
    },
  ],
])

/** Сумма партии: на ступени и выше последней; на прочих количествах — null. */
export function batchTotal(pricing: BatchPricing, quantity: number): number | null {
  const last = pricing.steps[pricing.steps.length - 1]
  if (quantity > last.qty) return last.totalRub + (quantity - last.qty) * pricing.extraUnitRub
  return pricing.steps.find((s) => s.qty === quantity)?.totalRub ?? null
}

/** Процентная скидка у реагентов и оборудования, кроме наборов и товаров с ценой партии. */
export function isPercentEligible(
  slug: string,
  categories: readonly string[] | undefined,
): boolean {
  // Наборы (в т.ч. с лишней категорией реагентов) и партии — только по своим правилам.
  if (BATCH_PRICING.has(slug) || WHOLESALE_GROUPS.some((g) => g.slugs.includes(slug))) return false
  return (categories ?? []).some((c) => PERCENT_CATEGORIES.includes(c))
}

/** Процент скидки для количества позиции (0 — ниже первой ступени). */
export function percentOff(quantity: number): number {
  return PERCENT_TIERS.find((t) => quantity >= t.minQty)?.percent ?? 0
}

/**
 * Сумма каждой строки со всеми оптовыми скидками, ₽ (ключ — слаг товара).
 * Не больше обычной цены × количество и не меньше 1 ₽ за штуку.
 */
export function wholesaleLineTotals(lines: readonly WholesaleLine[]): Map<string, number> {
  const unitOff = wholesaleUnitDiscounts(lines)
  const result = new Map<string, number>()
  for (const l of lines) {
    const list = l.priceRub * l.quantity
    const floor = l.quantity
    let total = list - (unitOff.get(l.slug) ?? 0) * l.quantity
    const batch = BATCH_PRICING.get(l.slug)
    if (batch) {
      const batchRub = batchTotal(batch, l.quantity)
      if (batchRub !== null && batchRub < list) total = Math.max(batchRub, floor)
    } else if (isPercentEligible(l.slug, l.categories)) {
      const percent = percentOff(l.quantity)
      if (percent > 0) total = Math.max(Math.round((list * (100 - percent)) / 100), floor)
    }
    // Правила не поднимают цену выше обычной (в т.ч. у бесплатных товаров пол в 1 ₽ неприменим).
    total = Math.min(total, list)
    result.set(l.slug, total)
  }
  return result
}
