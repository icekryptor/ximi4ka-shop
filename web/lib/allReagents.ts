import type { Product } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { listProductsByCategory } from './api'
import { pluralizeRu } from './i18n'

// «Запас всех реактивов» — все реактивы каталога по 2 шт. Своего состава у
// товара нет: на Тильде в описании стояло «Полный состав:» без списка, так и
// импортировалось. Список собираем из категории «Реактивы» по тем же правилам,
// что и бот заказов (api/src/lib/notifications/worker.ts): опубликованные
// товары категории без комбо «Три кислоты».
export const ALL_REAGENTS_SKU = 'RRR'
const ALL_REAGENTS_PER_SET = 2
const REAGENTS_CATEGORY_SLUG = 'reagents'
const REAGENT_COMBO_SLUGS: readonly string[] = ['tri-kisloti']

export type ReagentForContents = Pick<Product, 'slug' | 'name' | 'sortOrder'>

// Повисшая строка «Полный состав:» из импорта — её место занимает список.
const CONTENTS_STUB_RE = /^полный состав:?$/i

function isContentsStub(block: unknown): boolean {
  if (!isBlock(block) || block.type !== 'paragraph') return false
  const text = ((block as { html?: string }).html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return CONTENTS_STUB_RE.test(text)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Описание с составом: вместо «Полный состав:» — блок `<h3>Состав</h3>` со
 * списком реактивов, его рисует вкладка «Состав» (extractContentsHtml). Без
 * реактивов (api не ответил) описание возвращается как было.
 */
export function withAllReagentsContents(
  blocks: unknown[],
  reagents: readonly ReagentForContents[],
): unknown[] {
  const items = reagents
    .filter((r) => !REAGENT_COMBO_SLUGS.includes(r.slug))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
  if (items.length === 0) return blocks

  const count = items.length
  const lead = `${count} ${pluralizeRu(count, ['реактив', 'реактива', 'реактивов'])}, каждого по ${ALL_REAGENTS_PER_SET} шт.:`
  const list = items.map((r) => `<li>${escapeHtml(r.name)}</li>`).join('')
  const contents = {
    type: 'paragraph',
    html: `<h3>Состав</h3><p>${lead}</p><ul>${list}</ul>`,
  }
  return [...blocks.filter((b) => !isContentsStub(b)), contents]
}

/** Реактивы каталога для состава; при ошибке api — пусто, карточка без вкладки. */
export async function fetchReagentsForContents(): Promise<ReagentForContents[]> {
  try {
    const res = await listProductsByCategory(REAGENTS_CATEGORY_SLUG, { limit: 500 })
    return res.data
  } catch {
    return []
  }
}
