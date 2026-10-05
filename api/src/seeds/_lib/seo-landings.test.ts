// Контракт данных api/data/seo-landings.json: три посадочные страницы из
// семантического ядра (CMS-страницы, черновики). Тесты фиксируют требования
// брифа и редакционные запреты, чтобы правка текста их не сломала.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { loadSeoLandings, type SeoLanding } from './seo-landings.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data')

const EXPECTED_SLUGS = [
  'opyty-dlya-detej',
  'opyty-dlya-detej-v-nachalnoj-shkole',
  'khimicheskie-opyty-dlya-detej',
]

const FORBIDDEN_PHRASES = [
  'безопасно для детей без присмотра',
  'лучшая цена',
  'гаранти',
  'в современном мире',
  'стоит отметить',
  'давайте разберёмся',
  'давайте разберемся',
  'сертифицир',
]

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Весь читаемый текст страницы: абзацы, FAQ и заголовок сетки товаров.
function pageText(page: SeoLanding): string {
  const parts: string[] = []
  for (const block of page.blocks) {
    if (block.type === 'paragraph') parts.push(stripHtml(block.html))
    else if (block.type === 'faq')
      for (const item of block.items) parts.push(item.question, item.answer)
    else if (block.type === 'product_grid' && block.heading) parts.push(block.heading)
  }
  return parts.join(' ')
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

function h2Titles(page: SeoLanding): string[] {
  const titles: string[] = []
  for (const block of page.blocks) {
    if (block.type !== 'paragraph') continue
    for (const m of block.html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)) titles.push(stripHtml(m[1]!))
  }
  return titles
}

function hrefs(page: SeoLanding): string[] {
  const out: string[] = []
  for (const block of page.blocks) {
    if (block.type !== 'paragraph') continue
    for (const m of block.html.matchAll(/href="([^"]*)"/g)) out.push(m[1]!)
  }
  return out
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8')) as T
}

const bySlug = (pages: SeoLanding[], slug: string): SeoLanding =>
  pages.find((p) => p.slug === slug)!

describe('data/seo-landings.json', () => {
  it('содержит три страницы с ожидаемыми slug, каждый уникален', async () => {
    const pages = await loadSeoLandings()
    expect(pages.map((p) => p.slug).sort()).toEqual([...EXPECTED_SLUGS].sort())
    expect(new Set(pages.map((p) => p.slug)).size).toBe(3)
  })

  it('все страницы — черновики; флагов публикации в данных нет', async () => {
    const raw = await readJson<Record<string, unknown>[]>('seo-landings.json')
    expect(raw).toHaveLength(3)
    for (const entry of raw) {
      expect(entry.draft, `draft ${entry.slug}`).toBe(true)
      expect(entry).not.toHaveProperty('isPublished')
      expect(entry).not.toHaveProperty('ogImage')
    }
  })

  it('H1 60–80 символов, metaTitle ≤65 без бренда, metaDescription ≤160, H1 ≠ metaTitle', async () => {
    for (const p of await loadSeoLandings()) {
      expect(p.title.length, `title ${p.slug}`).toBeGreaterThanOrEqual(60)
      expect(p.title.length, `title ${p.slug}`).toBeLessThanOrEqual(80)
      expect(p.metaTitle.length, `metaTitle ${p.slug}`).toBeGreaterThanOrEqual(30)
      expect(p.metaTitle.length, `metaTitle ${p.slug}`).toBeLessThanOrEqual(65)
      expect(p.metaTitle, `brand in metaTitle ${p.slug}`).not.toMatch(/химичк|ximi4ka|\|/i)
      expect(p.metaDescription.length, `metaDescription ${p.slug}`).toBeGreaterThanOrEqual(80)
      expect(p.metaDescription.length, `metaDescription ${p.slug}`).toBeLessThanOrEqual(160)
      expect(p.title.trim().toLowerCase(), `title = metaTitle ${p.slug}`).not.toBe(
        p.metaTitle.trim().toLowerCase(),
      )
    }
  })

  it('title, metaTitle и metaDescription уникальны между страницами', async () => {
    const pages = await loadSeoLandings()
    for (const field of ['title', 'metaTitle', 'metaDescription'] as const) {
      expect(new Set(pages.map((p) => p[field])).size, field).toBe(pages.length)
    }
  })

  it('индексируемые: noindex=false', async () => {
    for (const p of await loadSeoLandings()) expect(p.noindex, p.slug).toBe(false)
  })

  it('объём 700–1100 слов, 4–6 содержательных разделов h2, без картинок', async () => {
    for (const p of await loadSeoLandings()) {
      const words = wordCount(pageText(p))
      expect(words, `слов в ${p.slug}`).toBeGreaterThanOrEqual(700)
      expect(words, `слов в ${p.slug}`).toBeLessThanOrEqual(1100)
      // Разделы по существу: без служебных «Безопасность», FAQ и «Итог».
      const sections = h2Titles(p).filter((t) => !/часто задаваемые|безопасност|^итог/i.test(t))
      expect(sections.length, `разделов h2 в ${p.slug}`).toBeGreaterThanOrEqual(4)
      expect(sections.length, `разделов h2 в ${p.slug}`).toBeLessThanOrEqual(6)
      expect(
        p.blocks.some((b) => b.type === 'image'),
        `image в ${p.slug}`,
      ).toBe(false)
    }
  })

  it('все блоки валидны; первым идёт вступление, последним — заключение «Итог»', async () => {
    for (const p of await loadSeoLandings()) {
      expect(p.blocks.every((b) => isBlock(b))).toBe(true)
      const first = p.blocks[0]!
      expect(first.type).toBe('paragraph')
      if (first.type === 'paragraph') expect(first.html).not.toMatch(/<h[1-4]/)
      const titles = h2Titles(p)
      expect(titles[titles.length - 1], `последний h2 в ${p.slug}`).toMatch(/^итог/i)
      expect(p.blocks[p.blocks.length - 1]!.type).toBe('paragraph')
    }
  })

  it('FAQ: один блок, 4–5 вопросов с ответами', async () => {
    for (const p of await loadSeoLandings()) {
      const faqs = p.blocks.filter((b) => b.type === 'faq')
      expect(faqs, `faq в ${p.slug}`).toHaveLength(1)
      const items = faqs[0]!.type === 'faq' ? faqs[0]!.items : []
      expect(items.length).toBeGreaterThanOrEqual(4)
      expect(items.length).toBeLessThanOrEqual(5)
      for (const item of items) {
        expect(item.question.trim().length).toBeGreaterThan(10)
        expect(item.answer.trim().length).toBeGreaterThan(30)
      }
    }
  })

  it('product_grid: один блок, 3–6 уникальных существующих slug из каталога', async () => {
    const catalog = await readJson<{ slug: string }[]>('tilda-catalog.json')
    const catalogSlugs = new Set(catalog.map((p) => p.slug))
    for (const p of await loadSeoLandings()) {
      const grids = p.blocks.filter((b) => b.type === 'product_grid')
      expect(grids, `product_grid в ${p.slug}`).toHaveLength(1)
      const slugs = grids[0]!.type === 'product_grid' ? grids[0]!.productSlugs : []
      expect(slugs.length).toBeGreaterThanOrEqual(3)
      expect(slugs.length).toBeLessThanOrEqual(6)
      expect(new Set(slugs).size).toBe(slugs.length)
      for (const s of slugs) expect(catalogSlugs.has(s), `${p.slug}: нет товара ${s}`).toBe(true)
    }
  })

  it('страница для 1–4 классов показывает только лабораторную посуду: возраст детей в каталоге подтверждён лишь для наборов от 10 лет', async () => {
    const catalog = await readJson<{ slug: string; categorySlug: string }[]>('tilda-catalog.json')
    const page = bySlug(await loadSeoLandings(), 'opyty-dlya-detej-v-nachalnoj-shkole')
    const grid = page.blocks.find((b) => b.type === 'product_grid')
    const slugs = grid?.type === 'product_grid' ? grid.productSlugs : []
    for (const s of slugs) {
      const item = catalog.find((c) => c.slug === s)!
      expect(item.categorySlug, `${s} не оборудование`).toBe('equipment')
    }
  })

  it('внутренние ссылки относительные и ведут на существующие страницы, статьи и товары', async () => {
    const catalog = await readJson<{ slug: string }[]>('tilda-catalog.json')
    const drafts = await readJson<{ slug: string }[]>('seo-blog-drafts.json')
    const published = await readJson<{ slug: string }[]>('tilda-articles.json')
    const productSlugs = new Set(catalog.map((c) => c.slug))
    const blogSlugs = new Set([...drafts, ...published].map((a) => a.slug))
    for (const p of await loadSeoLandings()) {
      for (const href of hrefs(p)) {
        expect(href, `${p.slug}: ссылка ${href}`).toMatch(/^\/[a-z0-9/-]+$/)
        if (href.startsWith('/product/')) {
          expect(productSlugs.has(href.slice('/product/'.length)), `${p.slug}: ${href}`).toBe(true)
        } else if (href.startsWith('/blog/')) {
          expect(blogSlugs.has(href.slice('/blog/'.length)), `${p.slug}: ${href}`).toBe(true)
        } else {
          expect(EXPECTED_SLUGS, `${p.slug}: ${href}`).toContain(href.slice(1))
        }
        expect(href).not.toBe(`/${p.slug}`)
      }
    }
  })

  it('хаб ведёт на обе дочерние страницы и минимум на две статьи блога', async () => {
    const hub = bySlug(await loadSeoLandings(), 'opyty-dlya-detej')
    const links = hrefs(hub)
    expect(links).toContain('/opyty-dlya-detej-v-nachalnoj-shkole')
    expect(links).toContain('/khimicheskie-opyty-dlya-detej')
    expect(links.filter((l) => l.startsWith('/blog/')).length).toBeGreaterThanOrEqual(2)
  })

  it('дочерние страницы ссылаются обратно на хаб', async () => {
    const pages = await loadSeoLandings()
    for (const slug of EXPECTED_SLUGS.filter((s) => s !== 'opyty-dlya-detej')) {
      expect(hrefs(bySlug(pages, slug)), slug).toContain('/opyty-dlya-detej')
    }
  })

  it('slug не перекрыты 301 из карты редиректов и не дублируют CMS-страницы', async () => {
    const csv = await readFile(path.join(DATA_DIR, 'tilda-redirects.csv'), 'utf-8')
    const fromPaths = new Set(
      csv
        .split('\n')
        .slice(1)
        .map((line) => line.split(',')[0]!.trim())
        .filter(Boolean),
    )
    const cms = await readJson<{ slug: string }[]>('cms-pages.json')
    const cmsSlugs = new Set(cms.map((c) => c.slug))
    for (const p of await loadSeoLandings()) {
      expect(fromPaths.has(`/${p.slug}`), `редирект с /${p.slug}`).toBe(false)
      expect(cmsSlugs.has(p.slug), `${p.slug} уже есть в cms-pages.json`).toBe(false)
    }
  })

  it('есть раздел «Безопасность» с осторожными формулировками', async () => {
    for (const p of await loadSeoLandings()) {
      const titles = h2Titles(p)
      expect(
        titles.some((t) => /безопасност/i.test(t)),
        `раздел безопасности в ${p.slug}`,
      ).toBe(true)
      const text = pageText(p).toLowerCase()
      expect(text, `взрослые в ${p.slug}`).toMatch(/взросл/)
      expect(text, `на вкус в ${p.slug}`).toMatch(/на вкус/)
    }
  })

  it('химическая страница: очки, перчатки, малые количества, проветривание, хранение вне досягаемости', async () => {
    const text = pageText(
      bySlug(await loadSeoLandings(), 'khimicheskie-opyty-dlya-detej'),
    ).toLowerCase()
    for (const word of ['очки', 'перчатки', 'малые количества', 'проветрива', 'недоступн']) {
      expect(text, word).toContain(word)
    }
  })

  it('нет запрещённых фраз, цен и обещаний возраста, которых нет в каталоге', async () => {
    for (const p of await loadSeoLandings()) {
      const text = [p.title, p.metaTitle, p.metaDescription, pageText(p)].join(' ').toLowerCase()
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text, `«${phrase}» в ${p.slug}`).not.toContain(phrase)
      }
      expect(text, `цена в ${p.slug}`).not.toMatch(/\d\s*(₽|руб)/)
      // Возраст наборов — только из карточки (10–18); других возрастных границ
      // для наборов не придумываем.
      expect(text, `возраст набора в ${p.slug}`).not.toMatch(
        /(набор\S*|химичк\S*)[^.]{0,60}от [1-9]\s*лет/,
      )
    }
  })
})
