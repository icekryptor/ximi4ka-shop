// Поведение сида освежения старых статей (seo-article-refresh.json) на тестовой
// БД: заполняет только пустые мета и автора, дописывает блоки в конец без
// дублей при повторе, ничего не пишет в dry-run.
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Block } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { BlogPost } from '../../entities/BlogPost.js'
import {
  applyArticleRefresh,
  planArticleRefresh,
  loadSeoArticleRefresh,
  type SeoArticleRefresh,
} from './seo-article-refresh.js'

const FAQ: Block = {
  type: 'faq',
  items: [
    { question: 'Вопрос 1?', answer: 'Ответ 1.' },
    { question: 'Вопрос 2?', answer: 'Ответ 2.' },
    { question: 'Вопрос 3?', answer: 'Ответ 3.' },
  ],
}
const GRID: Block = {
  type: 'product_grid',
  productSlugs: ['himichka-30', 'mini-himichka'],
  heading: 'Наборы для опытов',
}
const ALSO_READ: Block = {
  type: 'paragraph',
  html: '<h2>Читайте также</h2><ul><li><a href="/blog/a">Статья А</a></li></ul>',
}

const ENTRY: SeoArticleRefresh = {
  slug: 'stat-a',
  name: 'Статья А',
  draft: false,
  metaTitle: 'Новый заголовок',
  metaDescription: 'Новое описание.',
  authorName: 'Василий Аистов',
  appendBlocks: [FAQ, GRID, ALSO_READ],
}

const BODY: Block = { type: 'paragraph', html: '<p>Текст статьи.</p>' }

describe('planArticleRefresh', () => {
  const empty = {
    metaTitle: null,
    metaDescription: null,
    authorName: null,
    blocks: [BODY] as unknown[],
  }

  it('пустые поля (null, пробелы) попадают в patch, блоки дописываются после существующих', () => {
    const plan = planArticleRefresh({ ...empty, metaTitle: '  ', authorName: '' }, ENTRY)
    expect(plan.patch).toEqual({
      metaTitle: 'Новый заголовок',
      metaDescription: 'Новое описание.',
      authorName: 'Василий Аистов',
      blocks: [BODY, FAQ, GRID, ALSO_READ],
    })
    expect(plan.filled).toEqual(['metaTitle', 'metaDescription', 'authorName', 'blocks'])
    expect(plan.appended).toEqual(['faq', 'product_grid', 'paragraph «Читайте также»'])
    expect(plan.skipped).toEqual([])
  })

  it('непустые поля не трогает и сообщает о пропуске', () => {
    const plan = planArticleRefresh(
      {
        metaTitle: 'Своё',
        metaDescription: 'Своё описание',
        authorName: 'Другой',
        blocks: [BODY, FAQ, GRID, ALSO_READ],
      },
      ENTRY,
    )
    expect(plan.patch).toEqual({})
    expect(plan.skipped).toEqual(['metaTitle', 'metaDescription', 'authorName', 'blocks'])
  })

  it('поля, которых нет в записи данных, не попадают ни в patch, ни в skipped', () => {
    const plan = planArticleRefresh(empty, { slug: 'x', name: 'X', draft: false })
    expect(plan.patch).toEqual({})
    expect(plan.skipped).toEqual([])
    expect(plan.filled).toEqual([])
  })

  it('faq и product_grid не добавляются, если блок такого типа уже есть (в том числе правленный)', () => {
    const editedFaq: Block = { type: 'faq', items: [{ question: 'Мой?', answer: 'Мой.' }] }
    const editedGrid: Block = { type: 'product_grid', productSlugs: ['probirka'] }
    const plan = planArticleRefresh(
      { ...empty, blocks: [BODY, editedFaq, editedGrid] },
      { ...ENTRY, appendBlocks: [FAQ, GRID, ALSO_READ] },
    )
    expect(plan.patch.blocks).toEqual([BODY, editedFaq, editedGrid, ALSO_READ])
    expect(plan.appended).toEqual(['paragraph «Читайте также»'])
  })

  it('«Читайте также» не дублируется, даже если список ссылок правили', () => {
    const edited: Block = {
      type: 'paragraph',
      html: '<h2>Читайте также</h2><ul><li><a href="/blog/b">Другая</a></li></ul>',
    }
    const plan = planArticleRefresh({ ...empty, blocks: [BODY, edited] }, ENTRY)
    expect(plan.patch.blocks).toEqual([BODY, edited, FAQ, GRID])
  })

  it('узнаёт уже добавленный блок при другом порядке ключей (jsonb)', () => {
    const reordered = {
      heading: 'Наборы для опытов',
      productSlugs: ['himichka-30', 'mini-himichka'],
      type: 'product_grid',
    }
    const plan = planArticleRefresh(
      { ...empty, blocks: [BODY, reordered] },
      { ...ENTRY, appendBlocks: [GRID] },
    )
    expect(plan.patch).toEqual({
      metaTitle: 'Новый заголовок',
      metaDescription: 'Новое описание.',
      authorName: 'Василий Аистов',
    })
  })

  it('предупреждает о заполненном metaTitle длиннее 65 символов, но не меняет его', () => {
    const long = 'я'.repeat(66)
    const plan = planArticleRefresh({ ...empty, metaTitle: long }, ENTRY)
    expect(plan.patch.metaTitle).toBeUndefined()
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('66')
  })
})

describe('applyArticleRefresh', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE blog_posts RESTART IDENTITY CASCADE')
  })

  const repo = () => AppDataSource.getRepository(BlogPost)
  const save = (extra: Partial<BlogPost> = {}) =>
    repo().save(
      repo().create({
        slug: 'stat-a',
        title: 'Статья А',
        blocks: [BODY],
        isPublished: true,
        publishedAt: new Date('2026-09-01T00:00:00Z'),
        ...extra,
      }),
    )

  it('заполняет пустое и дописывает блоки в конец, остальное не трогает', async () => {
    await save()

    const report = await applyArticleRefresh(repo(), [ENTRY])

    expect(report.filled).toEqual([
      {
        slug: 'stat-a',
        fields: ['metaTitle', 'metaDescription', 'authorName', 'blocks'],
        appendedBlocks: ['faq', 'product_grid', 'paragraph «Читайте также»'],
      },
    ])
    const row = await repo().findOneByOrFail({ slug: 'stat-a' })
    expect(row.metaTitle).toBe('Новый заголовок')
    expect(row.metaDescription).toBe('Новое описание.')
    expect(row.authorName).toBe('Василий Аистов')
    expect(row.blocks).toEqual([BODY, FAQ, GRID, ALSO_READ])
    // Остальное не тронуто.
    expect(row.title).toBe('Статья А')
    expect(row.isPublished).toBe(true)
    expect(row.publishedAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(row.coverImageUrl).toBeNull()
    expect(row.authorBio).toBeNull()
  })

  it('не перезаписывает непустое: мета, автор и существующий текст остаются как есть', async () => {
    await save({
      metaTitle: 'Правка из админки',
      metaDescription: 'Описание из админки',
      authorName: 'Другой Автор',
      blocks: [BODY, { type: 'paragraph', html: '<p>Мой абзац.</p>' }],
    })

    const report = await applyArticleRefresh(repo(), [{ ...ENTRY, appendBlocks: [] }])

    expect(report.filled).toEqual([])
    expect(report.untouched).toEqual([
      { slug: 'stat-a', fields: ['metaTitle', 'metaDescription', 'authorName'] },
    ])
    const row = await repo().findOneByOrFail({ slug: 'stat-a' })
    expect(row.metaTitle).toBe('Правка из админки')
    expect(row.metaDescription).toBe('Описание из админки')
    expect(row.authorName).toBe('Другой Автор')
    expect(row.blocks).toEqual([BODY, { type: 'paragraph', html: '<p>Мой абзац.</p>' }])
  })

  it('заполняет только пустую часть, если часть полей уже есть', async () => {
    await save({ metaDescription: 'Описание из админки' })

    const report = await applyArticleRefresh(repo(), [ENTRY])

    expect(report.filled[0]?.fields).toEqual(['metaTitle', 'authorName', 'blocks'])
    expect(report.untouched).toEqual([{ slug: 'stat-a', fields: ['metaDescription'] }])
    const row = await repo().findOneByOrFail({ slug: 'stat-a' })
    expect(row.metaDescription).toBe('Описание из админки')
    expect(row.metaTitle).toBe('Новый заголовок')
  })

  it('блоки не дублируются при повторе (на реальной БД, порядок ключей jsonb)', async () => {
    await save()

    await applyArticleRefresh(repo(), [ENTRY])
    const before = await repo().findOneByOrFail({ slug: 'stat-a' })
    const second = await applyArticleRefresh(repo(), [ENTRY])
    const after = await repo().findOneByOrFail({ slug: 'stat-a' })

    expect(second.filled).toEqual([])
    expect(after.blocks).toEqual([BODY, FAQ, GRID, ALSO_READ])
    // updatedAt сдвигается только у реально изменённых статей.
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
  })

  it('updatedAt сдвигается только у изменённой статьи', async () => {
    await save()
    await save({
      slug: 'stat-b',
      title: 'Б',
      metaTitle: 'Б',
      metaDescription: 'Б',
      authorName: 'Б',
    })
    const b0 = await repo().findOneByOrFail({ slug: 'stat-b' })
    const a0 = await repo().findOneByOrFail({ slug: 'stat-a' })
    await new Promise((r) => setTimeout(r, 20))

    await applyArticleRefresh(repo(), [
      ENTRY,
      { ...ENTRY, slug: 'stat-b', name: 'Б', appendBlocks: [] },
    ])

    const a1 = await repo().findOneByOrFail({ slug: 'stat-a' })
    const b1 = await repo().findOneByOrFail({ slug: 'stat-b' })
    expect(a1.updatedAt.getTime()).toBeGreaterThan(a0.updatedAt.getTime())
    expect(b1.updatedAt.toISOString()).toBe(b0.updatedAt.toISOString())
  })

  it('неизвестный slug и мягко удалённая статья пропускаются с отчётом', async () => {
    const gone = await save({ slug: 'udalena', title: 'Удалена' })
    await repo().softDelete(gone.id)
    await save()

    const report = await applyArticleRefresh(repo(), [
      { ...ENTRY, slug: 'net-takoj' },
      { ...ENTRY, slug: 'udalena' },
      ENTRY,
    ])

    expect(report.unknown).toEqual(['net-takoj', 'udalena'])
    expect(report.filled.map((f) => f.slug)).toEqual(['stat-a'])
    const row = await repo().findOneOrFail({ where: { slug: 'udalena' }, withDeleted: true })
    expect(row.metaTitle).toBeNull()
    expect(row.blocks).toEqual([BODY])
    expect(row.deletedAt).not.toBeNull()
  })

  it('черновики (draft: true) пропускает, пока не передан includeDrafts', async () => {
    await save()
    const draft = { ...ENTRY, draft: true }

    const skipped = await applyArticleRefresh(repo(), [draft])
    expect(skipped.drafts).toEqual(['stat-a'])
    expect(skipped.filled).toEqual([])
    expect((await repo().findOneByOrFail({ slug: 'stat-a' })).metaTitle).toBeNull()

    const applied = await applyArticleRefresh(repo(), [draft], { includeDrafts: true })
    expect(applied.filled).toHaveLength(1)
    expect((await repo().findOneByOrFail({ slug: 'stat-a' })).metaTitle).toBe('Новый заголовок')
  })

  it('dryRun считает план, но ничего не пишет', async () => {
    await save()
    const before = await repo().findOneByOrFail({ slug: 'stat-a' })

    const report = await applyArticleRefresh(repo(), [ENTRY], { dryRun: true })

    expect(report.filled).toHaveLength(1)
    expect(report.filled[0]?.fields).toEqual([
      'metaTitle',
      'metaDescription',
      'authorName',
      'blocks',
    ])
    const after = await repo().findOneByOrFail({ slug: 'stat-a' })
    expect(after.metaTitle).toBeNull()
    expect(after.authorName).toBeNull()
    expect(after.blocks).toEqual([BODY])
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
  })

  it('реальные данные: применяются к статьям, повторный запуск ничего не меняет', async () => {
    const entries = await loadSeoArticleRefresh()
    for (const e of entries) await save({ slug: e.slug, title: e.name, blocks: [BODY] })

    const first = await applyArticleRefresh(repo(), entries, { includeDrafts: true })
    expect(first.filled).toHaveLength(entries.length)
    expect(first.unknown).toEqual([])
    const second = await applyArticleRefresh(repo(), entries, { includeDrafts: true })

    expect(second.filled).toEqual([])
    expect(second.warnings).toEqual([])
    for (const e of entries) {
      const row = await repo().findOneByOrFail({ slug: e.slug })
      expect(row.blocks).toEqual([BODY, ...(e.appendBlocks ?? [])])
    }
  })
})
