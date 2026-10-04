// Перенос CMS-страниц со старого сайта на Tilda (ximi4ka.ru) в таблицу pages.
// Данные лежат в api/data/cms-pages.json; здесь — чтение файла и идемпотентная
// вставка. Сид только СОЗДАЁТ отсутствующие страницы: правки из админки
// (в том числе снятие с публикации и удаление) повторный запуск не трогает.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Block } from '@ximi4ka-shop/shared'
import type { Repository } from 'typeorm'
import type { Page } from '../../entities/Page.js'

export interface CmsPageEntry {
  /** Страница на Tilda, с которой перенесён текст (для сверки и аудита). */
  sourceUrl: string
  /** Совпадает с URL на Tilda и с целью редиректа в tilda-redirects.csv. */
  slug: string
  title: string
  metaTitle: string
  metaDescription: string
  noindex: boolean
  blocks: Block[]
}

// api/ package root (этот файл лежит в api/src/seeds/_lib/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const CMS_PAGES_JSON_PATH = path.join(API_ROOT, 'data', 'cms-pages.json')

export async function readCmsPages(): Promise<CmsPageEntry[]> {
  const raw = await readFile(CMS_PAGES_JSON_PATH, 'utf-8')
  return JSON.parse(raw) as CmsPageEntry[]
}

export interface CreateMissingResult {
  created: number
  skipped: number
}

// Создаёт страницы, которых ещё нет. Существующая запись с тем же slug —
// включая мягко удалённую — пропускается: её содержимое принадлежит админке.
export async function createMissingPages(
  repo: Repository<Page>,
  entries: CmsPageEntry[],
): Promise<CreateMissingResult> {
  let created = 0
  let skipped = 0
  for (const entry of entries) {
    const existing = await repo.findOne({ where: { slug: entry.slug }, withDeleted: true })
    if (existing) {
      skipped++
      continue
    }
    await repo.save(
      repo.create({
        slug: entry.slug,
        title: entry.title,
        metaTitle: entry.metaTitle,
        metaDescription: entry.metaDescription,
        noindex: entry.noindex,
        blocks: entry.blocks,
        translations: {},
        isPublished: true,
      }),
    )
    created++
  }
  return { created, skipped }
}
