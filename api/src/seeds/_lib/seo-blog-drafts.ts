// Черновики SEO-статей блога (api/data/seo-blog-drafts.json): загрузка данных
// и идемпотентный импорт. Вынесено из seeds/import-seo-blog-drafts.ts, чтобы
// поведение проверялось тестами на тестовой БД.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Block } from '@ximi4ka-shop/shared'
import type { Repository } from 'typeorm'
import type { BlogPost } from '../../entities/BlogPost.js'

// api/ package root (this file lives at api/src/seeds/_lib/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SEO_BLOG_DRAFTS_PATH = path.join(API_ROOT, 'data', 'seo-blog-drafts.json')

export interface SeoBlogDraft {
  slug: string
  title: string
  metaTitle: string
  metaDescription: string
  excerpt: string
  rubric: string
  isPublished: false
  blocks: Block[]
}

export interface ImportResult {
  /** slug статей, которые созданы (при dry-run — были бы созданы). */
  created: string[]
  /** slug статей, которые уже есть в БД (в том числе удалённые) и не тронуты. */
  skipped: string[]
}

export async function loadSeoBlogDrafts(): Promise<SeoBlogDraft[]> {
  const raw = await readFile(SEO_BLOG_DRAFTS_PATH, 'utf-8')
  return JSON.parse(raw) as SeoBlogDraft[]
}

// Создаёт только отсутствующие статьи (по slug). Существующие — в том числе
// мягко удалённые — не меняются и не восстанавливаются. Всё создаётся
// черновиками: isPublished=false, publishedAt=null.
export async function importSeoBlogDrafts(
  repo: Repository<BlogPost>,
  drafts: SeoBlogDraft[],
  { dryRun }: { dryRun: boolean },
): Promise<ImportResult> {
  const result: ImportResult = { created: [], skipped: [] }
  for (const draft of drafts) {
    const exists = await repo.exists({ where: { slug: draft.slug }, withDeleted: true })
    if (exists) {
      result.skipped.push(draft.slug)
      continue
    }
    if (!dryRun) {
      await repo.save(
        repo.create({
          slug: draft.slug,
          title: draft.title,
          metaTitle: draft.metaTitle,
          metaDescription: draft.metaDescription,
          excerpt: draft.excerpt,
          rubric: draft.rubric,
          blocks: draft.blocks,
          isPublished: false,
          publishedAt: null,
        }),
      )
    }
    result.created.push(draft.slug)
  }
  return result
}
