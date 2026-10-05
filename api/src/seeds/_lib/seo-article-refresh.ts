// Освежение четырёх старых статей блога, импортированных с Tilda
// (api/data/seo-article-refresh.json): мета, автор, блоки в конец статьи.
//
// Статьи уже опубликованы на проде, поэтому импорт максимально осторожный:
// заполняет ТОЛЬКО пустые metaTitle / metaDescription / authorName и ДОПИСЫВАЕТ
// блоки в конец; существующий текст и заполненные поля не перезаписываются.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { Block } from '@ximi4ka-shop/shared'
import type { Repository } from 'typeorm'
import type { BlogPost } from '../../entities/BlogPost.js'

// Лимиты мета-тегов. Суффикс « — Химичка» к title добавляет код, не данные.
export const META_TITLE_MAX = 65
export const META_DESCRIPTION_MAX = 160

// api/ package root (this file lives at api/src/seeds/_lib/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SEO_ARTICLE_REFRESH_PATH = path.join(API_ROOT, 'data', 'seo-article-refresh.json')

export interface SeoArticleRefresh {
  slug: string
  // Название статьи — только чтобы человеку было видно, к чему правка;
  // тест сверяет его с tilda-articles.json.
  name: string
  // true — правка ещё не проверена владельцем; без includeDrafts не импортируется.
  draft: boolean
  metaTitle?: string
  metaDescription?: string
  authorName?: string
  // Блоки, которые дописываются в конец статьи (faq, product_grid, paragraph).
  appendBlocks?: Block[]
}

export type RefreshField = 'metaTitle' | 'metaDescription' | 'authorName' | 'blocks'

const FIELD_ORDER: RefreshField[] = ['metaTitle', 'metaDescription', 'authorName', 'blocks']

export interface ArticleRefreshOptions {
  includeDrafts?: boolean
  dryRun?: boolean
}

export interface ArticleFieldReport {
  slug: string
  fields: RefreshField[]
}

export interface ArticleFilledReport extends ArticleFieldReport {
  // Какие блоки дописаны (при dryRun — были бы дописаны).
  appendedBlocks: string[]
}

export interface ArticleRefreshReport {
  // Поля, которые заполнены (при dryRun — были бы заполнены).
  filled: ArticleFilledReport[]
  // Поля, которые уже были непустыми (или блоки уже есть) и остались как есть.
  untouched: ArticleFieldReport[]
  // Slug, которых нет в БД (или статья мягко удалена).
  unknown: string[]
  // Записи с draft: true, пропущенные без includeDrafts.
  drafts: string[]
  // На что владельцу стоит обратить внимание (ничего не меняется).
  warnings: Array<{ slug: string; message: string }>
}

type CurrentArticle = Pick<BlogPost, 'metaTitle' | 'metaDescription' | 'authorName' | 'blocks'>
type ArticlePatch = Partial<CurrentArticle>

export interface ArticleRefreshPlan {
  patch: ArticlePatch
  filled: RefreshField[]
  appended: string[]
  skipped: RefreshField[]
  warnings: string[]
}

export async function loadSeoArticleRefresh(): Promise<SeoArticleRefresh[]> {
  return JSON.parse(await readFile(SEO_ARTICLE_REFRESH_PATH, 'utf-8')) as SeoArticleRefresh[]
}

function isEmptyText(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

function leadingHeading(html: string): string | null {
  const m = /^\s*<h2[^>]*>(.*?)<\/h2>/s.exec(html)
  return m ? m[1]!.replace(/<[^>]+>/g, '').trim() : null
}

// Подпись блока для отчёта.
function describeBlock(block: Block): string {
  if (block.type === 'paragraph') {
    const heading = leadingHeading(block.html)
    return heading ? `paragraph «${heading}»` : 'paragraph'
  }
  return block.type
}

// Блок считается уже присутствующим, если в статье есть:
//  - для faq и product_grid — любой блок того же типа (в том числе правленный
//    в админке: второй FAQ или вторую витрину не добавляем);
//  - для paragraph с заголовком <h2> — абзац с тем же заголовком (правленный
//    список ссылок не дублируем);
//  - иначе — глубоко равный блок. Сравнение без учёта порядка ключей: jsonb в
//    Postgres переупорядочивает их, JSON.stringify здесь не годится.
function isPresent(existing: unknown[], block: Block): boolean {
  if (block.type === 'faq' || block.type === 'product_grid') {
    return existing.some((b) => (b as { type?: unknown } | null)?.type === block.type)
  }
  if (block.type === 'paragraph') {
    const heading = leadingHeading(block.html)
    if (heading !== null) {
      return existing.some((b) => {
        const e = b as { type?: unknown; html?: unknown } | null
        return (
          e?.type === 'paragraph' &&
          typeof e.html === 'string' &&
          leadingHeading(e.html) === heading
        )
      })
    }
  }
  return existing.some((b) => isDeepStrictEqual(b, block))
}

// Что нужно записать в статью: только поля, которые есть в записи данных И пусты
// в статье, плюс блоки, которых в статье ещё нет. skipped — поля из записи, у
// которых в статье уже всё на месте.
export function planArticleRefresh(
  current: CurrentArticle,
  entry: SeoArticleRefresh,
): ArticleRefreshPlan {
  const patch: ArticlePatch = {}
  const skipped: RefreshField[] = []
  const warnings: string[] = []
  const appended: string[] = []

  if (entry.metaTitle !== undefined) {
    if (isEmptyText(current.metaTitle)) patch.metaTitle = entry.metaTitle
    else {
      skipped.push('metaTitle')
      const length = current.metaTitle!.length
      if (length > META_TITLE_MAX) {
        warnings.push(
          `metaTitle заполнен и длиннее ${META_TITLE_MAX} символов (${length}); не перезаписан — при необходимости сократить в админке`,
        )
      }
    }
  }
  if (entry.metaDescription !== undefined) {
    if (isEmptyText(current.metaDescription)) patch.metaDescription = entry.metaDescription
    else skipped.push('metaDescription')
  }
  if (entry.authorName !== undefined) {
    if (isEmptyText(current.authorName)) patch.authorName = entry.authorName
    else skipped.push('authorName')
  }

  const wanted = entry.appendBlocks ?? []
  if (wanted.length > 0) {
    const existing = Array.isArray(current.blocks) ? current.blocks : []
    const toAppend: Block[] = []
    for (const block of wanted) {
      // Проверка и против уже решённых к добавлению: два одинаковых блока в
      // данных не должны дать дубль.
      if (isPresent([...existing, ...toAppend], block)) continue
      toAppend.push(block)
      appended.push(describeBlock(block))
    }
    if (toAppend.length > 0) patch.blocks = [...existing, ...toAppend]
    else skipped.push('blocks')
  }

  return {
    patch,
    filled: FIELD_ORDER.filter((f) => f in patch),
    appended,
    skipped: FIELD_ORDER.filter((f) => skipped.includes(f)),
    warnings,
  }
}

export async function applyArticleRefresh(
  repo: Repository<BlogPost>,
  entries: SeoArticleRefresh[],
  options: ArticleRefreshOptions = {},
): Promise<ArticleRefreshReport> {
  const report: ArticleRefreshReport = {
    filled: [],
    untouched: [],
    unknown: [],
    drafts: [],
    warnings: [],
  }

  for (const entry of entries) {
    if (entry.draft && !options.includeDrafts) {
      report.drafts.push(entry.slug)
      continue
    }

    // findOne по умолчанию не видит мягко удалённые статьи — для освежения это
    // то же, что «нет такой статьи»: удалённое не восстанавливаем и не правим.
    const post = await repo.findOne({ where: { slug: entry.slug } })
    if (!post) {
      report.unknown.push(entry.slug)
      continue
    }

    const plan = planArticleRefresh(post, entry)
    for (const message of plan.warnings) report.warnings.push({ slug: entry.slug, message })
    if (plan.filled.length > 0) {
      // updatedAt обновляется самим TypeORM только при реальном update(), поэтому
      // статья без изменений не «обновляется» (и не меняет lastmod в sitemap).
      if (!options.dryRun) {
        // jsonb-колонка blocks (unknown[]) не проходит глубокий тип update().
        await repo.update({ id: post.id }, plan.patch as Parameters<typeof repo.update>[1])
      }
      report.filled.push({ slug: entry.slug, fields: plan.filled, appendedBlocks: plan.appended })
    }
    if (plan.skipped.length > 0) report.untouched.push({ slug: entry.slug, fields: plan.skipped })
  }

  return report
}
