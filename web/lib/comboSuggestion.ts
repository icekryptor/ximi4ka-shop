import { KIT_COMBOS } from './kitCombos'
import { MAX_QTY, priceStaged, type StagedLine } from './wholesaleStaging'

/** Комбо-товар в том виде, в каком он кладётся в список: поля строки без количества. */
export type ComboProduct = Pick<
  StagedLine,
  'productId' | 'slug' | 'name' | 'priceRub' | 'image' | 'categories' | 'stockStatus'
>

export interface ComboSuggestion {
  combo: ComboProduct
  /** Сколько комбо заменят отдельные наборы. */
  times: number
  /** Список после замены. */
  nextLines: StagedLine[]
  savingsRub: number
}

/**
 * Самая выгодная замена отдельных наборов комбо или null. Выгода считается
 * по реальным ценам: оптовая скидка на отдельные наборы учитывается, поэтому
 * на больших количествах комбо дороже и подсказки не будет.
 */
export function suggestCombo(
  lines: readonly StagedLine[],
  offers: ReadonlyMap<string, ComboProduct>,
): ComboSuggestion | null {
  const before = priceStaged(lines).totalRub
  let best: ComboSuggestion | null = null
  for (const def of KIT_COMBOS) {
    const combo = offers.get(def.slug)
    if (!combo || combo.stockStatus === 'out_of_stock') continue
    const quantityOf = (slug: string) => lines.find((l) => l.slug === slug)?.quantity ?? 0
    const times = Math.min(...def.components.map(quantityOf))
    if (times < 1) continue

    const rest = lines
      .map((l) => (def.components.includes(l.slug) ? { ...l, quantity: l.quantity - times } : l))
      .filter((l) => l.quantity > 0)
    const nextLines = rest.some((l) => l.slug === def.slug)
      ? rest.map((l) =>
          l.slug === def.slug ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + times) } : l,
        )
      : [...rest, { ...combo, quantity: times }]

    const savingsRub = before - priceStaged(nextLines).totalRub
    if (savingsRub > 0 && (!best || savingsRub > best.savingsRub)) {
      best = { combo, times, nextLines, savingsRub }
    }
  }
  return best
}
