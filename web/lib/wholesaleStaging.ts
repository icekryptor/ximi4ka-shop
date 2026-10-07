import type { SearchProductResult } from '@ximi4ka-shop/shared'
import {
  BATCH_PRICING,
  PERCENT_TIERS,
  WHOLESALE_GROUPS,
  isPercentEligible,
  wholesaleLineTotals,
} from './wholesale'

// Логика оптового блока без React: шаги количества, цена списка, подсказки.
// Цены считает тот же движок, что корзина и сервер (./wholesale).

export const MAX_QTY = 99

export interface StagedLine {
  productId: string
  slug: string
  name: string
  priceRub: number
  image: string | null
  categories: string[]
  stockStatus: SearchProductResult['stockStatus']
  quantity: number
}

export type PricedLine = StagedLine & { listRub: number; totalRub: number }

/** Стартовое количество: у партий — первая ступень, у остальных — первая ступень скидки. */
export function initialQuantity(slug: string): number {
  const batch = BATCH_PRICING.get(slug)
  return batch ? batch.steps[0].qty : 5
}

export function toStagedLine(p: SearchProductResult): StagedLine {
  return {
    productId: p.id,
    slug: p.slug,
    name: p.name,
    priceRub: p.priceRub,
    image: p.image,
    categories: p.categories,
    stockStatus: p.stockStatus,
    quantity: initialQuantity(p.slug),
  }
}

/** Шаг количества: у пробирок и пипеток по ступеням таблицы, выше последней — по одному. */
export function stepQuantity(slug: string, current: number, direction: 1 | -1): number {
  const batch = BATCH_PRICING.get(slug)
  if (!batch) return Math.min(MAX_QTY, Math.max(1, current + direction))

  const ladder = batch.steps.map((s) => s.qty)
  const top = ladder[ladder.length - 1]
  if (direction > 0) {
    if (current >= top) return Math.min(MAX_QTY, current + 1)
    return ladder.find((q) => q > current) ?? top
  }
  if (current > top) return current - 1
  const lower = [...ladder].reverse().find((q) => q < current)
  return lower ?? ladder[0]
}

export function priceStaged(lines: readonly StagedLine[]): {
  lines: PricedLine[]
  listRub: number
  totalRub: number
  savingsRub: number
} {
  const totals = wholesaleLineTotals(lines)
  const priced = lines.map((l) => {
    const listRub = l.priceRub * l.quantity
    return { ...l, listRub, totalRub: totals.get(l.slug) ?? listRub }
  })
  const listRub = priced.reduce((sum, l) => sum + l.listRub, 0)
  const totalRub = priced.reduce((sum, l) => sum + l.totalRub, 0)
  return { lines: priced, listRub, totalRub, savingsRub: listRub - totalRub }
}

function ascendingThresholds(slug: string, categories: readonly string[]): number[] {
  const batch = BATCH_PRICING.get(slug)
  if (batch) return batch.steps.map((s) => s.qty)
  const group = WHOLESALE_GROUPS.find((g) => g.slugs.includes(slug))
  if (group) return group.tiers.map((t) => t.minQty).reverse()
  if (isPercentEligible(slug, categories)) return PERCENT_TIERS.map((t) => t.minQty).reverse()
  return []
}

/** «ещё N шт — и цена станет ниже»; null, если следующей ступени нет. */
export function nextTierHint(line: StagedLine): string | null {
  const next = ascendingThresholds(line.slug, line.categories).find((t) => t > line.quantity)
  return next === undefined ? null : `ещё ${next - line.quantity} шт — и цена станет ниже`
}

/** Короткое описание оптового правила товара для карточки в подсказках; null — правила нет. */
export function wholesaleBadge(slug: string, categories: readonly string[]): string | null {
  const batch = BATCH_PRICING.get(slug)
  if (batch) return `партиями от ${batch.steps[0].qty} шт`
  const group = WHOLESALE_GROUPS.find((g) => g.slugs.includes(slug))
  if (group) {
    const first = group.tiers[group.tiers.length - 1]
    return `от ${first.minQty} шт: −${first.offRub} ₽ с набора`
  }
  if (isPercentEligible(slug, categories)) {
    const first = PERCENT_TIERS[PERCENT_TIERS.length - 1]
    return `от ${first.minQty} шт: −${first.percent}%`
  }
  return null
}

/**
 * Цена за штуку на первой ступени, где оптом выходит дешевле обычной цены, и
 * количество этой ступени; null — оптового правила нет или выгоды нет. Сумму
 * считает тот же движок, что корзина: у партий дорогая первая ступень пропускается.
 */
export function wholesaleFromPrice(
  slug: string,
  categories: readonly string[],
  priceRub: number,
): { unitRub: number; minQty: number } | null {
  for (const minQty of ascendingThresholds(slug, categories)) {
    const total = wholesaleLineTotals([{ slug, quantity: minQty, priceRub, categories }]).get(slug)
    if (total !== undefined && total < priceRub * minQty) {
      return { unitRub: Math.round(total / minQty), minQty }
    }
  }
  return null
}
