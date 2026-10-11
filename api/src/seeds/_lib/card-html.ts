// Общие кирпичики HTML для карточек наборов (oge-card, electro-card, mini-himichka-card, himichka-30-card): витрина
// читает блоки «Состав» и «Характеристики» по этим форматам.
import type { Block } from '@ximi4ka-shop/shared'

export interface Reagent {
  formula: string
  name: string
}

export interface ReagentGroup {
  title: string
  items: Reagent[]
  // true — индикаторы: в счёт «N реактивов» с коробки они не входят.
  indicator?: boolean
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Цифры после буквы или «)» — индексы: Al2(SO4)3 → Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>.
export function formulaHtml(formula: string): string {
  return escapeHtml(formula).replace(/(?<=[A-Za-z)])(\d+)/g, '<sub>$1</sub>')
}

export const h2 = (text: string): Block => ({
  type: 'paragraph',
  html: `<h2>${escapeHtml(text)}</h2>`,
})
export const p = (text: string): Block => ({
  type: 'paragraph',
  html: `<p>${escapeHtml(text)}</p>`,
})

// Блок <h3>Состав</h3>: группы реактивов + списки «Оборудование» и т. п.
// extraLists — дополнительные списки после реактивов (заголовок → пункты).
export function compositionBlock(
  groups: ReagentGroup[],
  extraLists: ReadonlyArray<{ title: string; items: string[] }>,
): Block {
  const reagents = groups
    .map((g) => {
      const items = g.items
        .map((r) => {
          const head = r.formula ? `<strong>${formulaHtml(r.formula)}</strong> — ` : ''
          return `<li>${head}${escapeHtml(r.name)}</li>`
        })
        .join('')
      return `<p><strong>${escapeHtml(g.title)}</strong></p><ul>${items}</ul>`
    })
    .join('')
  const extra = extraLists
    .map((l) => {
      const items = l.items.map((e) => `<li>${escapeHtml(e)}</li>`).join('')
      return `<p><strong>${escapeHtml(l.title)}</strong></p><ul>${items}</ul>`
    })
    .join('')
  return { type: 'paragraph', html: `<h3>Состав</h3>${reagents}${extra}` }
}

// parseCharacteristics на витрине ждёт <li><strong>Ключ:</strong> Значение</li>.
export function characteristicsBlock(rows: ReadonlyArray<readonly [string, string]>): Block {
  const items = rows
    .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
    .join('')
  return { type: 'paragraph', html: `<h3>Характеристики</h3><ul>${items}</ul>` }
}
