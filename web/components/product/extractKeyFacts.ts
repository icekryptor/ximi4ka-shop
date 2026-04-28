/**
 * Pick up to 4 "key facts" from a parsed characteristics record, in priority
 * order. Used by KeyFactsList to surface the most relevant spec rows on a
 * product card without making the editor pick them per product.
 */
const PRIORITY_KEYS: readonly string[] = [
  'Возраст',
  'Концентрация',
  'Объем',
  'Масса',
  'Химическая формула',
  'Квалификация',
  'ГОСТ',
  'Срок хранения',
  'Производитель',
  'Цвет',
  'Материал',
  'Кол-во гнезд',
]

const MAX_FACTS = 4

export function extractKeyFacts(
  characteristics: Record<string, string>,
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []
  for (const key of PRIORITY_KEYS) {
    if (characteristics[key]) {
      facts.push({ label: key, value: characteristics[key] })
      if (facts.length >= MAX_FACTS) break
    }
  }
  return facts
}

import type { Product } from '@ximi4ka-shop/shared'

export interface UseFact {
  key: 'age' | 'time' | 'lead' | 'warranty'
  label: string
  big: string
  bottomLeft: string
  bottomRight: string
}

const USE_FACT_DEFINITIONS: ReadonlyArray<{
  key: UseFact['key']
  label: string
  bottomLeft: string
  bottomRight: string
  charKeys: readonly string[]
}> = [
  { key: 'age',      label: 'возраст',  bottomLeft: 'от 10 лет',    bottomRight: 'рекомендуется',     charKeys: ['Возраст', 'Age'] },
  { key: 'time',     label: 'время',    bottomLeft: 'минут',         bottomRight: 'на один опыт',     charKeys: ['Время опыта', 'Время'] },
  { key: 'lead',     label: 'срок',     bottomLeft: 'готовность',    bottomRight: 'к отправке',       charKeys: ['Срок изготовления', 'Срок'] },
  { key: 'warranty', label: 'гарантия', bottomLeft: 'на компоненты', bottomRight: 'возврат 30 дней',  charKeys: ['Гарантия'] },
]

/**
 * Extracts up to 4 "use-facts" (age, time, lead, warranty) for the v3
 * Characteristics section's NumberCell row. Each cell hides individually
 * when its characteristic is missing — the row auto-collapses.
 */
export function extractUseFacts(
  characteristics: Record<string, string>,
): UseFact[] {
  const out: UseFact[] = []
  for (const def of USE_FACT_DEFINITIONS) {
    const value = def.charKeys.map((k) => characteristics[k]).find(Boolean)
    if (value) {
      out.push({
        key: def.key,
        label: def.label,
        big: value,
        bottomLeft: def.bottomLeft,
        bottomRight: def.bottomRight,
      })
    }
  }
  return out
}

/**
 * Returns product images sorted by sortOrder ascending. Empty array when
 * the product has no images — caller is responsible for fallback rendering.
 */
export function extractGalleryImages(product: Product): Product['images'] {
  return [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)
}
