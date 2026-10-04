// Логика импорта SEO-черновиков карточек товаров (data/seo-product-texts.json).
//
// Главное правило: импорт ТОЛЬКО ЗАПОЛНЯЕТ пустые поля. Всё, что уже есть в
// БД (в том числе правки владельца в админке), остаётся как есть.
import { isDeepStrictEqual } from 'node:util'
import type { Repository } from 'typeorm'
import type { Block } from '@ximi4ka-shop/shared'
import type { Product } from '../../entities/Product.js'

// Лимиты мета-тегов. Суффикс « — Химичка» к title добавляет код, не данные.
export const META_TITLE_MAX = 65
export const META_DESCRIPTION_MAX = 160

export type SeoTextBlock = { type: 'heading'; text: string } | { type: 'paragraph'; text: string }

export interface SeoFaqItem {
  question: string
  answer: string
}

export interface SeoProductText {
  slug: string
  // Название из каталога — только чтобы человеку было видно, к чему текст;
  // тест сверяет его с tilda-catalog.json.
  name: string
  // true — текст ещё не проверен владельцем; без --include-drafts не импортируется.
  draft: boolean
  metaTitle?: string
  metaDescription?: string
  longDescription?: SeoTextBlock[]
  faq?: SeoFaqItem[]
}

export type SeoField = 'metaTitle' | 'metaDescription' | 'longDescriptionBlocks'

export interface SeoFillOptions {
  // Дописывать SEO-блоки после уже существующего описания (по умолчанию
  // описание, в котором что-то есть, не трогается).
  appendLongDescription?: boolean
}

export interface SeoApplyOptions extends SeoFillOptions {
  includeDrafts?: boolean
  dryRun?: boolean
}

export interface SeoFieldReport {
  slug: string
  fields: SeoField[]
}

export interface SeoImportReport {
  // Поля, которые заполнены (при dryRun — были бы заполнены).
  filled: SeoFieldReport[]
  // Поля, которые уже были непустыми и остались как есть.
  untouched: SeoFieldReport[]
  // Slug, которых нет в БД (или товар мягко удалён).
  unknown: string[]
  // Записи с draft: true, пропущенные без includeDrafts.
  drafts: string[]
}

type CurrentSeo = Pick<Product, 'metaTitle' | 'metaDescription' | 'longDescriptionBlocks'>
type SeoPatch = Partial<CurrentSeo>

const FIELD_ORDER: SeoField[] = ['metaTitle', 'metaDescription', 'longDescriptionBlocks']

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isEmptyText(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

// Заголовок — тоже paragraph-блок с <h2>: отдельного heading-блока в
// shared/types/blocks.ts нет (isBlock отфильтровал бы его), а страница товара
// уже так живёт — «Состав»/«Характеристики» хранятся как <h3> в paragraph.
export function buildLongDescriptionBlocks(entry: SeoProductText): Block[] {
  const blocks: Block[] = (entry.longDescription ?? []).map((b) => ({
    type: 'paragraph',
    html: b.type === 'heading' ? `<h2>${escapeHtml(b.text)}</h2>` : `<p>${escapeHtml(b.text)}</p>`,
  }))
  if (entry.faq && entry.faq.length > 0) {
    blocks.push({ type: 'faq', items: entry.faq.map((f) => ({ ...f })) })
  }
  return blocks
}

// Что нужно записать в товар: только поля, которые есть в записи данных И пусты
// в товаре. skipped — поля из записи, которые в товаре уже заполнены.
export function planSeoFill(
  current: CurrentSeo,
  entry: SeoProductText,
  options: SeoFillOptions = {},
): { patch: SeoPatch; skipped: SeoField[] } {
  const patch: SeoPatch = {}
  const skipped: SeoField[] = []

  if (entry.metaTitle !== undefined) {
    if (isEmptyText(current.metaTitle)) patch.metaTitle = entry.metaTitle
    else skipped.push('metaTitle')
  }
  if (entry.metaDescription !== undefined) {
    if (isEmptyText(current.metaDescription)) patch.metaDescription = entry.metaDescription
    else skipped.push('metaDescription')
  }

  const newBlocks = buildLongDescriptionBlocks(entry)
  if (newBlocks.length > 0) {
    const existing = Array.isArray(current.longDescriptionBlocks)
      ? current.longDescriptionBlocks
      : []
    if (existing.length === 0) {
      patch.longDescriptionBlocks = newBlocks
    } else if (options.appendLongDescription) {
      // Повторный запуск не должен дописывать тот же текст ещё раз. Сравнение
      // без учёта порядка ключей: jsonb в Postgres переупорядочивает их.
      const marker = newBlocks[0]
      if (existing.some((b) => isDeepStrictEqual(b, marker))) skipped.push('longDescriptionBlocks')
      else patch.longDescriptionBlocks = [...existing, ...newBlocks]
    } else {
      skipped.push('longDescriptionBlocks')
    }
  }

  return { patch, skipped }
}

export async function applySeoProductTexts(
  repo: Repository<Product>,
  entries: SeoProductText[],
  options: SeoApplyOptions = {},
): Promise<SeoImportReport> {
  const report: SeoImportReport = { filled: [], untouched: [], unknown: [], drafts: [] }

  for (const entry of entries) {
    if (entry.draft && !options.includeDrafts) {
      report.drafts.push(entry.slug)
      continue
    }

    // findOne по умолчанию не видит мягко удалённые товары — для импорта это
    // то же, что «нет такого товара».
    const product = await repo.findOne({ where: { slug: entry.slug } })
    if (!product) {
      report.unknown.push(entry.slug)
      continue
    }

    const { patch, skipped } = planSeoFill(product, entry, options)
    const filledFields = FIELD_ORDER.filter((f) => f in patch)
    if (filledFields.length > 0) {
      if (!options.dryRun) {
        // jsonb-колонка longDescriptionBlocks (unknown[]) не проходит глубокий тип update().
        await repo.update({ id: product.id }, patch as Parameters<typeof repo.update>[1])
      }
      report.filled.push({ slug: entry.slug, fields: filledFields })
    }
    if (skipped.length > 0) {
      report.untouched.push({
        slug: entry.slug,
        fields: FIELD_ORDER.filter((f) => skipped.includes(f)),
      })
    }
  }

  return report
}
