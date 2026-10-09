// Контракт данных api/data/seo-oge-article-body.json: новое тело статьи
// /blog/podhodyat-li-nabory-dlya-oge. Сида нет (существующие блоки статьи не
// перезаписываются), текст вставляет владелец в админке, поэтому тест держит
// черновик в рамках правил WORKFLOW 6.3: без обещаний, на фактах каталога и ФИПИ.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

interface Body {
  slug: string
  draft: boolean
  sources: string[]
  blocks: Array<{ type: string; html: string }>
}

async function readBody(): Promise<Body> {
  return JSON.parse(await readFile(path.join(DATA_DIR, 'seo-oge-article-body.json'), 'utf-8'))
}

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Те же запреты, что у SEO-текстов карточек и черновиков статей, плюс то, что
// стояло в старом тексте статьи с Tilda и не подтверждено данными.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['лучший', /лучш(?:ий|ая|ее|ие|его|ей|ему|им|ими|ую|их)(?![а-яё])/i],
  ['гарантия', /гаранти/i],
  ['сертификат', /сертифиц/i],
  ['безопасно для детей', /безопасн\S*\s+для\s+дет/i],
  ['безопасный/безопасно', /безопасн(?:о|ый|ая|ое|ые|ых|ым|ой)(?![а-яё])/i],
  ['более 120 экспериментов', /120/],
  ['стандарты качества', /стандарт\S*\s+качеств/i],
  ['штамп', /в современном мире|стоит отметить|давайте разберёмся|давайте разберемся/i],
]

describe('data/seo-oge-article-body.json', () => {
  it('черновик для статьи podhodyat-li-nabory-dlya-oge с источником ФИПИ', async () => {
    const body = await readBody()
    expect(body.slug).toBe('podhodyat-li-nabory-dlya-oge')
    expect(body.draft).toBe(true)
    expect(body.sources.every((s) => s.startsWith('https://doc.fipi.ru/'))).toBe(true)
  })

  it('в тексте нет запрещённых формулировок', async () => {
    const text = plain((await readBody()).blocks.map((b) => b.html).join(' '))
    for (const [label, re] of FORBIDDEN) {
      expect(re.test(text), `«${label}»`).toBe(false)
    }
  })

  it('структура: ответ в начале, 4+ раздела H2, 350–900 слов, ссылки на два набора', async () => {
    const { blocks } = await readBody()
    expect(blocks[0]!.html.startsWith('<p>')).toBe(true)
    const h2 = blocks.filter((b) => b.html.startsWith('<h2>'))
    expect(h2.length).toBeGreaterThanOrEqual(4)
    const text = plain(blocks.map((b) => b.html).join(' '))
    const words = text.split(' ').filter((w) => /\p{L}|\p{N}/u.test(w)).length
    expect(words).toBeGreaterThanOrEqual(350)
    expect(words).toBeLessThanOrEqual(900)
    const html = blocks.map((b) => b.html).join('')
    expect(html).toContain('href="/product/bolshoi-nabor-dlya-oge"')
    expect(html).toContain('href="/product/himichka-30"')
  })

  it('FAQ и «Читайте также» в тело не входят: их добавляет seo-article-refresh', async () => {
    const html = (await readBody()).blocks.map((b) => b.html).join('')
    expect(html).not.toMatch(/Читайте также/i)
    expect(html).not.toMatch(/Частые вопросы/i)
  })

  it('факты ФИПИ: задание 23, 5 баллов из 14', async () => {
    const text = plain((await readBody()).blocks.map((b) => b.html).join(' '))
    expect(text).toContain('№23')
    expect(text).toContain('до 5 баллов')
    expect(text).toContain('до 14 баллов')
  })
})
