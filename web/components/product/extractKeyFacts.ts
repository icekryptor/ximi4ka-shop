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
