// Логика импорта SEO-черновиков категорий (data/seo-category-texts.json):
// metaTitle, metaDescription и SEO-блоки (текст + FAQ) под сеткой товаров.
//
// Главное правило то же, что у текстов товаров: импорт ТОЛЬКО ЗАПОЛНЯЕТ пустые
// поля. Всё, что уже есть в БД (в том числе правки владельца в админке),
// остаётся как есть.
import type { Repository } from 'typeorm'
import type { Block } from '@ximi4ka-shop/shared'
import type { ProductCategory } from '../../entities/ProductCategory.js'

// Лимиты мета-тегов. Суффикс « — Химичка» к title добавляет код, не данные.
export const META_TITLE_MAX = 65
export const META_DESCRIPTION_MAX = 160

export interface SeoCategoryText {
  slug: string
  // Название категории из каталога — только чтобы человеку было видно, к чему
  // текст; тест сверяет его с CATALOG_CATEGORIES.
  name: string
  // true — текст ещё не проверен владельцем; без --include-drafts не импортируется.
  draft: boolean
  metaTitle?: string
  metaDescription?: string
  // Блоки в том же формате, что у страниц и статей: заголовок — paragraph с
  // <h2>/<h3>, FAQ — блок faq (даёт разметку FAQPage).
  seoBlocks?: Block[]
}

export type SeoCategoryField = 'metaTitle' | 'metaDescription' | 'seoBlocks'

export interface SeoCategoryFieldReport {
  slug: string
  fields: SeoCategoryField[]
}

export interface SeoCategoryImportReport {
  // Поля, которые заполнены (при dryRun — были бы заполнены).
  filled: SeoCategoryFieldReport[]
  // Поля, которые уже были непустыми и остались как есть.
  untouched: SeoCategoryFieldReport[]
  // Slug, которых нет в БД.
  unknown: string[]
  // Записи с draft: true, пропущенные без includeDrafts.
  drafts: string[]
}

export interface SeoCategoryApplyOptions {
  includeDrafts?: boolean
  dryRun?: boolean
}

type CurrentSeo = Pick<ProductCategory, 'metaTitle' | 'metaDescription' | 'seoBlocks'>
type SeoPatch = Partial<CurrentSeo>

const FIELD_ORDER: SeoCategoryField[] = ['metaTitle', 'metaDescription', 'seoBlocks']

function isEmptyText(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

// Пусто — это NULL или []; любое другое значение (в том числе нестандартное)
// считается чужой правкой и не перезаписывается.
function isEmptyBlocks(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0)
}

// Что нужно записать в категорию: только поля, которые есть в записи данных И
// пусты в категории. skipped — поля из записи, которые в категории уже заполнены.
export function planSeoCategoryFill(
  current: CurrentSeo,
  entry: SeoCategoryText,
): { patch: SeoPatch; skipped: SeoCategoryField[] } {
  const patch: SeoPatch = {}
  const skipped: SeoCategoryField[] = []

  if (entry.metaTitle !== undefined) {
    if (isEmptyText(current.metaTitle)) patch.metaTitle = entry.metaTitle
    else skipped.push('metaTitle')
  }
  if (entry.metaDescription !== undefined) {
    if (isEmptyText(current.metaDescription)) patch.metaDescription = entry.metaDescription
    else skipped.push('metaDescription')
  }
  if (entry.seoBlocks !== undefined && entry.seoBlocks.length > 0) {
    if (isEmptyBlocks(current.seoBlocks)) patch.seoBlocks = structuredClone(entry.seoBlocks)
    else skipped.push('seoBlocks')
  }

  return { patch, skipped }
}

export async function applySeoCategoryTexts(
  repo: Repository<ProductCategory>,
  entries: SeoCategoryText[],
  options: SeoCategoryApplyOptions = {},
): Promise<SeoCategoryImportReport> {
  const report: SeoCategoryImportReport = { filled: [], untouched: [], unknown: [], drafts: [] }

  for (const entry of entries) {
    if (entry.draft && !options.includeDrafts) {
      report.drafts.push(entry.slug)
      continue
    }

    const category = await repo.findOne({ where: { slug: entry.slug } })
    if (!category) {
      report.unknown.push(entry.slug)
      continue
    }

    const { patch, skipped } = planSeoCategoryFill(category, entry)
    const filledFields = FIELD_ORDER.filter((f) => f in patch)
    if (filledFields.length > 0) {
      if (!options.dryRun) {
        // jsonb-колонка seoBlocks (unknown[]) не проходит глубокий тип update().
        await repo.update({ id: category.id }, patch as Parameters<typeof repo.update>[1])
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
