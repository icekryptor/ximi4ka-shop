// Посадочные страницы из семантического ядра (api/data/seo-landings.json):
// загрузка данных и идемпотентный импорт в pages. Вынесено из
// seeds/import-seo-landings.ts, чтобы поведение проверялось тестами на БД.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Block } from '@ximi4ka-shop/shared'
import type { Repository } from 'typeorm'
import type { Page } from '../../entities/Page.js'

// api/ package root (this file lives at api/src/seeds/_lib/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SEO_LANDINGS_PATH = path.join(API_ROOT, 'data', 'seo-landings.json')

export interface SeoLanding {
  /** Целевой адрес из листа «Seo» семантического ядра, без ведущего слеша. */
  slug: string
  /** H1 страницы (в таблице pages поле title). */
  title: string
  metaTitle: string
  metaDescription: string
  noindex: boolean
  /** true — текст не вычитан владельцем; без includeDrafts не импортируется. */
  draft: boolean
  blocks: Block[]
}

export interface ImportResult {
  /** slug страниц, которые созданы (при dry-run — были бы созданы). */
  created: string[]
  /** slug страниц, которые уже есть в БД (в том числе удалённые) и не тронуты. */
  skipped: string[]
  /** slug черновиков, пропущенных из-за отсутствия includeDrafts. */
  draftsHeld: string[]
}

export async function loadSeoLandings(): Promise<SeoLanding[]> {
  const raw = await readFile(SEO_LANDINGS_PATH, 'utf-8')
  return JSON.parse(raw) as SeoLanding[]
}

// Создаёт только отсутствующие страницы (по slug). Существующие — в том числе
// мягко удалённые — не меняются и не восстанавливаются: их содержимое
// принадлежит админке. Всё создаётся неопубликованным (isPublished=false);
// публикация — только вручную в админке после вычитки.
export async function importSeoLandings(
  repo: Repository<Page>,
  landings: SeoLanding[],
  { dryRun, includeDrafts = false }: { dryRun: boolean; includeDrafts?: boolean },
): Promise<ImportResult> {
  const result: ImportResult = { created: [], skipped: [], draftsHeld: [] }
  for (const landing of landings) {
    if (landing.draft && !includeDrafts) {
      result.draftsHeld.push(landing.slug)
      continue
    }
    const existing = await repo.findOne({ where: { slug: landing.slug }, withDeleted: true })
    if (existing) {
      result.skipped.push(landing.slug)
      continue
    }
    if (!dryRun) {
      await repo.save(
        repo.create({
          slug: landing.slug,
          title: landing.title,
          metaTitle: landing.metaTitle,
          metaDescription: landing.metaDescription,
          noindex: landing.noindex,
          blocks: landing.blocks,
          translations: {},
          isPublished: false,
        }),
      )
    }
    result.created.push(landing.slug)
  }
  return result
}
