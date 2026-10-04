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
  // Автор статьи. В данных задан только authorName; остальные поля — на случай,
  // если их позже заполнят (должность, био, ссылку и фото не придумываем).
  authorName?: string
  authorJobTitle?: string
  authorBio?: string
  authorUrl?: string
  authorPhotoUrl?: string
  isPublished: false
  blocks: Block[]
}

export interface ImportResult {
  /** slug статей, которые созданы (при dry-run — были бы созданы). */
  created: string[]
  /** slug статей, которые уже есть в БД (в том числе удалённые) и не тронуты. */
  skipped: string[]
  /** slug существующих статей, которым дописан (при dry-run — был бы дописан) автор. */
  authorFilled: string[]
}

const AUTHOR_FIELDS = [
  'authorName',
  'authorJobTitle',
  'authorBio',
  'authorUrl',
  'authorPhotoUrl',
] as const

export async function loadSeoBlogDrafts(): Promise<SeoBlogDraft[]> {
  const raw = await readFile(SEO_BLOG_DRAFTS_PATH, 'utf-8')
  return JSON.parse(raw) as SeoBlogDraft[]
}

const isEmpty = (value: string | null | undefined): boolean => !value || value.trim() === ''

// Создаёт только отсутствующие статьи (по slug). Существующие — в том числе
// мягко удалённые — не меняются и не восстанавливаются. Всё создаётся
// черновиками: isPublished=false, publishedAt=null.
// Исключение — setAuthorOnExisting: у существующих (не удалённых) статей без
// authorName дописываются только пустые поля автора из данных; заполненное
// не перезаписывается.
export async function importSeoBlogDrafts(
  repo: Repository<BlogPost>,
  drafts: SeoBlogDraft[],
  { dryRun, setAuthorOnExisting = false }: { dryRun: boolean; setAuthorOnExisting?: boolean },
): Promise<ImportResult> {
  const result: ImportResult = { created: [], skipped: [], authorFilled: [] }
  for (const draft of drafts) {
    const existing = await repo.findOne({ where: { slug: draft.slug }, withDeleted: true })
    if (existing) {
      result.skipped.push(draft.slug)
      if (setAuthorOnExisting && !existing.deletedAt && isEmpty(existing.authorName)) {
        const patch: Partial<Record<(typeof AUTHOR_FIELDS)[number], string>> = {}
        for (const field of AUTHOR_FIELDS) {
          const value = draft[field]
          if (!isEmpty(value) && isEmpty(existing[field])) patch[field] = value
        }
        if (Object.keys(patch).length > 0) {
          if (!dryRun) await repo.update({ id: existing.id }, patch)
          result.authorFilled.push(draft.slug)
        }
      }
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
          authorName: draft.authorName ?? null,
          authorJobTitle: draft.authorJobTitle ?? null,
          authorBio: draft.authorBio ?? null,
          authorUrl: draft.authorUrl ?? null,
          authorPhotoUrl: draft.authorPhotoUrl ?? null,
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
