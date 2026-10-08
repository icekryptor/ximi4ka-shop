// Контракт данных api/data/cms-pages.json: страницы, на которые ведут 301-редиректы
// из карты Tilda и которые должны существовать в новой витрине как CMS-страницы.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { parseRedirectCsv } from '../../lib/redirect-csv.js'
import { sanitizeHtml } from './sanitize-html.js'
import { readCmsPages, type CmsPageEntry } from './cms-pages.js'

const REDIRECTS_CSV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/tilda-redirects.csv',
)

// Цели редиректов, которые обслуживаются не CMS: префиксы роутов витрины
// (категории, товары, блог) и страница «О нас», заведённая отдельно.
const NON_CMS_PREFIXES = ['/categories/', '/product/', '/blog/']
const SEEDED_ELSEWHERE = new Set(['/o-nas'])
// /success и /fail — Next-роуты (платёжный флоу), не CMS.
const NEXT_ROUTES = new Set(['/success', '/fail'])

const textOf = (html: string) =>
  sanitizeHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function pageText(page: CmsPageEntry): string {
  return page.blocks
    .map((b) => (b.type === 'paragraph' ? textOf(b.html) : ''))
    .join(' ')
    .trim()
}

describe('data/cms-pages.json', () => {
  it('содержит страницы первого приоритета', async () => {
    const pages = await readCmsPages()
    const slugs = pages.map((p) => p.slug)
    for (const slug of ['policy', 'oferta', 'collab', 'cert', 'faq']) {
      expect(slugs).toContain(slug)
    }
  })

  it('слаги уникальны, не пересекаются с Next-роутами и совпадают с форматом URL Tilda', async () => {
    const pages = await readCmsPages()
    const slugs = pages.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9_-]+$/)
      expect(NEXT_ROUTES.has(`/${slug}`)).toBe(false)
    }
  })

  it('каждая CMS-цель редиректа из карты 301 есть в импорте', async () => {
    const pages = await readCmsPages()
    const slugs = new Set(pages.map((p) => `/${p.slug}`))
    const { rows } = parseRedirectCsv(await readFile(REDIRECTS_CSV_PATH, 'utf-8'))

    const dangling = rows
      .map((r) => r.toPath)
      .filter((to) => !NON_CMS_PREFIXES.some((p) => to.startsWith(p)))
      .filter((to) => !SEEDED_ELSEWHERE.has(to) && !NEXT_ROUTES.has(to))
      .filter((to) => !slugs.has(to))

    expect(dangling).toEqual([])
  })

  it('SEO-поля: metaTitle ≤65 с «Химичка», metaDescription ≤160', async () => {
    for (const page of await readCmsPages()) {
      expect(page.title.length, page.slug).toBeGreaterThan(0)
      expect(page.metaTitle.length, `${page.slug} metaTitle`).toBeLessThanOrEqual(65)
      expect(page.metaTitle, `${page.slug} metaTitle`).toContain('Химичка')
      expect(page.metaDescription.length, `${page.slug} metaDescription`).toBeGreaterThan(0)
      expect(page.metaDescription.length, `${page.slug} metaDescription`).toBeLessThanOrEqual(160)
      expect(page.sourceUrl, page.slug).toMatch(/^https:\/\/ximi4ka\.ru\/[a-z0-9_]+$/)
    }
  })

  it('все блоки валидны, HTML стабилен при санитайзинге, картинки и ссылки без мусора', async () => {
    for (const page of await readCmsPages()) {
      expect(page.blocks.length, page.slug).toBeGreaterThan(0)
      for (const block of page.blocks) {
        expect(isBlock(block), `${page.slug}: ${JSON.stringify(block).slice(0, 80)}`).toBe(true)
        if (block.type === 'paragraph') {
          expect(sanitizeHtml(block.html), page.slug).toBe(block.html)
        }
        if (block.type === 'image') {
          expect(block.url, page.slug).toMatch(/^https:\/\/static\.tildacdn\.com\//)
          expect(block.alt.length, page.slug).toBeGreaterThan(0)
        }
        if (block.type === 'cta') {
          expect(block.buttonHref, page.slug).toMatch(/^(\/[a-z0-9/_-]+|https:\/\/.+)$/)
        }
      }
    }
  })

  it('юридические тексты перенесены целиком, не обрезаны', async () => {
    const pages = await readCmsPages()
    const policy = pageText(pages.find((p) => p.slug === 'policy')!)
    // На Tilda ~17 400 знаков; 12 разделов, последний — «Заключительные положения».
    expect(policy.length).toBeGreaterThan(15_000)
    for (let n = 1; n <= 12; n++) expect(policy).toMatch(new RegExp(`(^|\\s)${n}\\. [А-Я]`))
    expect(policy).toContain('Политика действует бессрочно')

    const oferta = pageText(pages.find((p) => p.slug === 'oferta')!)
    // На Tilda ~3 400 знаков; 9 разделов + реквизиты продавца в конце.
    expect(oferta.length).toBeGreaterThan(3_000)
    for (let n = 1; n <= 9; n++) expect(oferta).toMatch(new RegExp(`(^|\\s)${n}\\. [А-Я]`))
    expect(oferta).toContain('Продавец:')
    expect(oferta).toMatch(/ОГРНИП \d{15}$/)
  })

  it('продавец в оферте — ИП Аистов В. А. (решение владельца), без следов другого ИП', async () => {
    const page = (await readCmsPages()).find((p) => p.slug === 'oferta')!
    const oferta = pageText(page)
    expect(page.sourceUrl).toBe('https://ximi4ka.ru/oferta')
    expect(oferta).toMatch(/Аистов Василий Андреевич\s*, ИНН 431401950080, ОГРНИП 319435000027879/)
    expect(oferta).toMatch(
      /Продавец: ИП Аистов Василий Андреевич ИНН 431401950080 ОГРНИП 319435000027879$/,
    )
    expect(oferta).not.toMatch(/Ксени/)
    expect(oferta).not.toContain('431402136660')
    expect(oferta).not.toContain('323430000002972')
  })

  it('оператор в политике — Аистов В. А. (решение владельца от 08.10.2026), без следов другого лица', async () => {
    const policy = pageText((await readCmsPages()).find((p) => p.slug === 'policy')!)
    expect(policy).toMatch(/предпринимаемые\s+Аистов Василий Андреевич\s+\(далее\s+— Оператор\)/)
    expect(policy).not.toMatch(/Ксени/)
    expect(policy).not.toMatch(/Аистова/)
  })

  it('FAQ — блок faq с вопросами и ответами (из него строится FAQPage JSON-LD)', async () => {
    const faq = (await readCmsPages()).find((p) => p.slug === 'faq')!
    const faqBlocks = faq.blocks.filter((b) => b.type === 'faq')
    expect(faqBlocks).toHaveLength(1)
    const items = faqBlocks[0]!.type === 'faq' ? faqBlocks[0]!.items : []
    expect(items).toHaveLength(5)
    for (const item of items) {
      expect(item.question.length).toBeGreaterThan(5)
      expect(item.answer.length).toBeGreaterThan(20)
    }
  })

  it('служебные страницы закрыты от индексации, юридические и основные — нет', async () => {
    const bySlug = new Map((await readCmsPages()).map((p) => [p.slug, p]))
    for (const slug of ['policy', 'oferta', 'collab', 'cert', 'faq']) {
      expect(bySlug.get(slug)!.noindex, slug).toBe(false)
    }
    for (const slug of ['get_materials', 'zhuk']) {
      if (bySlug.has(slug)) expect(bySlug.get(slug)!.noindex, slug).toBe(true)
    }
  })

  it('страницы для Яндекс Мерчантов: оплата, доставка, возврат — из текста оферты и FAQ', async () => {
    const bySlug = new Map((await readCmsPages()).map((p) => [p.slug, p]))
    const oferta = pageText(bySlug.get('oferta')!)

    for (const slug of ['payment', 'delivery', 'return']) {
      const page = bySlug.get(slug)
      expect(page, slug).toBeDefined()
      expect(page!.noindex, slug).toBe(false)
      // Текст взят из оферты: фиксируем это ссылкой на источник.
      expect(page!.sourceUrl, slug).toBe('https://ximi4ka.ru/oferta')
    }

    const payment = pageText(bySlug.get('payment')!)
    expect(payment).toContain('в рублях Российской Федерации')
    expect(payment).toContain('способами, доступными на сайте интернет-магазина')
    expect(payment).toContain('с момента поступления денежных средств на расчётный счёт Продавца')

    const delivery = pageText(bySlug.get('delivery')!)
    expect(delivery).toContain('СДЭК')
    expect(delivery).toContain('Российская Федерация и страны СНГ')
    expect(delivery).toContain('рассчитываются при оформлении заказа')
    expect(delivery).toContain('с момента передачи товара службе доставки')

    // Условие о возврате переносится дословно из оферты (раздел 6), без смягчений
    // и без выдуманных сроков: любые изменения — решение владельца.
    const returns = pageText(bySlug.get('return')!)
    expect(oferta).toContain('не подлежат возврату и обмену')
    expect(returns).toContain('не подлежат возврату и обмену после передачи Покупателю')
    expect(returns).toContain('Покупатель подтверждает своё согласие с данным условием')
    expect(returns).toContain('@ximi4ka_support')
    expect(returns).not.toMatch(/\d+\s*(дн|день|дней|суток)/i)
  })

  it('/success и /fail не заведены как CMS', async () => {
    const slugs = (await readCmsPages()).map((p) => p.slug)
    expect(slugs).not.toContain('success')
    expect(slugs).not.toContain('fail')
  })
})
