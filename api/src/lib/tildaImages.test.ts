import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TILDA_IMAGE_MAP_FILENAME,
  collectTildaUrls,
  findTildaUrls,
  loadSeedImageMap,
  loadTildaImageMap,
  normalizeTildaUrl,
  rewriteTildaUrls,
  saveTildaImageMap,
} from './tildaImages.js'

const STATIC = 'https://static.tildacdn.com/tild6637-3930-4664-a139-613036326130/pic.png'
const THB = 'https://thb.tildacdn.com/tild3030-3633-4333-b762-396330616361/-/resize/20x/pic.jpg'
const OPTIM =
  'https://optim.tildacdn.com/tild3030-3633-4333-b762-396330616361/-/format/webp/pic.jpg.webp'

describe('findTildaUrls', () => {
  it('находит ссылки на три хоста tildacdn в html', () => {
    const html = `<p>текст</p><img src="${STATIC}" alt=""><img src='${THB}'><a href="${OPTIM}">x</a>`
    expect(findTildaUrls(html)).toEqual([STATIC, THB, OPTIM])
  })

  it('не трогает чужие хосты и похожие на tildacdn строки', () => {
    const text =
      'https://example.com/static.tildacdn.com/a.png https://tildacdn.com/a.png https://evil-static.tildacdn.com.example.org/a.png'
    expect(findTildaUrls(text)).toEqual([])
  })

  it('отрезает знаки препинания в конце фразы', () => {
    expect(findTildaUrls(`Смотри ${STATIC}.`)).toEqual([STATIC])
    expect(findTildaUrls(`(${STATIC}), и ещё`)).toEqual([STATIC])
  })

  it('понимает адреса без протокола и с http', () => {
    const raw = ['//static.tildacdn.com/a/b.png', 'http://static.tildacdn.com/a/c.png']
    expect(findTildaUrls(raw.join(' ')).map(normalizeTildaUrl)).toEqual([
      'https://static.tildacdn.com/a/b.png',
      'https://static.tildacdn.com/a/c.png',
    ])
  })
})

describe('collectTildaUrls', () => {
  it('обходит вложенные объекты и массивы, склеивает дубли', () => {
    const into = new Set<string>()
    collectTildaUrls(
      {
        blocks: [
          { type: 'image', url: STATIC },
          { type: 'paragraph', html: `<p><img src="${THB}"></p>` },
        ],
        translations: { en: { cover: STATIC } },
        n: 5,
        flag: true,
        nothing: null,
      },
      into,
    )
    expect([...into].sort()).toEqual([STATIC, THB].sort())
  })
})

describe('rewriteTildaUrls', () => {
  const map = new Map([
    [STATIC, '/uploads/tilda/aaa.png'],
    [THB, '/uploads/tilda/bbb.jpg'],
  ])

  it('заменяет ссылки в строке и считает замены', () => {
    const out = rewriteTildaUrls(STATIC, map)
    expect(out.value).toBe('/uploads/tilda/aaa.png')
    expect(out.replaced).toBe(1)
  })

  it('заменяет внутри json-структуры и не мутирует исходник', () => {
    const input = {
      blocks: [
        { type: 'image', url: STATIC },
        { type: 'paragraph', html: `<p>Смотри <img src="${THB}">.</p>` },
      ],
      untouched: 'https://example.com/a.png',
    }
    const snapshot = JSON.stringify(input)
    const out = rewriteTildaUrls(input, map)
    expect(out.replaced).toBe(2)
    expect(out.value).toEqual({
      blocks: [
        { type: 'image', url: '/uploads/tilda/aaa.png' },
        { type: 'paragraph', html: '<p>Смотри <img src="/uploads/tilda/bbb.jpg">.</p>' },
      ],
      untouched: 'https://example.com/a.png',
    })
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('сохраняет знак препинания, прилипший к ссылке', () => {
    expect(rewriteTildaUrls(`Вот: ${STATIC}.`, map).value).toBe('Вот: /uploads/tilda/aaa.png.')
  })

  it('оставляет ссылки, которых нет в карте', () => {
    const out = rewriteTildaUrls(OPTIM, map)
    expect(out.value).toBe(OPTIM)
    expect(out.replaced).toBe(0)
  })

  it('находит ссылку без протокола по нормализованному ключу', () => {
    const out = rewriteTildaUrls(
      '//static.tildacdn.com/tild6637-3930-4664-a139-613036326130/pic.png',
      map,
    )
    expect(out.value).toBe('/uploads/tilda/aaa.png')
  })
})

describe('карта url → /uploads', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tilda-map-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('отсутствующий файл — пустая карта', async () => {
    const map = await loadTildaImageMap(path.join(dir, TILDA_IMAGE_MAP_FILENAME))
    expect(map.size).toBe(0)
  })

  it('save → load возвращает то же, ключи отсортированы', async () => {
    const file = path.join(dir, TILDA_IMAGE_MAP_FILENAME)
    await saveTildaImageMap(
      file,
      new Map([
        [THB, '/uploads/tilda/b.jpg'],
        [STATIC, '/uploads/tilda/a.png'],
      ]),
    )
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, string>
    expect(Object.keys(raw)).toEqual([STATIC, THB].sort())
    const back = await loadTildaImageMap(file)
    expect(back.get(STATIC)).toBe('/uploads/tilda/a.png')
    expect(back.size).toBe(2)
  })

  it('битый json — ошибка, а не молчаливая пустая карта', async () => {
    const file = path.join(dir, TILDA_IMAGE_MAP_FILENAME)
    await writeFile(file, '{ not json')
    await expect(loadTildaImageMap(file)).rejects.toThrow()
  })
})

describe('loadSeedImageMap', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tilda-seed-map-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('по умолчанию берёт карту из uploads; нет карты — пусто', async () => {
    expect((await loadSeedImageMap({ uploadsDir: dir })).size).toBe(0)
    await saveTildaImageMap(
      path.join(dir, TILDA_IMAGE_MAP_FILENAME),
      new Map([[STATIC, '/uploads/tilda/a.png']]),
    )
    expect((await loadSeedImageMap({ uploadsDir: dir })).get(STATIC)).toBe('/uploads/tilda/a.png')
  })

  it('явный путь важнее uploads, --no-image-map отключает подстановку', async () => {
    await saveTildaImageMap(
      path.join(dir, TILDA_IMAGE_MAP_FILENAME),
      new Map([[STATIC, '/uploads/tilda/a.png']]),
    )
    const other = path.join(dir, 'other.json')
    await saveTildaImageMap(other, new Map([[THB, '/uploads/tilda/b.jpg']]))
    const explicit = await loadSeedImageMap({ uploadsDir: dir, explicitPath: other })
    expect([...explicit.keys()]).toEqual([THB])
    expect((await loadSeedImageMap({ uploadsDir: dir, disabled: true })).size).toBe(0)
  })

  it('явный путь к несуществующему файлу — ошибка (опечатку не молчим)', async () => {
    await expect(
      loadSeedImageMap({ uploadsDir: dir, explicitPath: path.join(dir, 'nope.json') }),
    ).rejects.toThrow()
  })
})

describe('данные в репозитории', () => {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

  async function urlsIn(file: string): Promise<Set<string>> {
    const set = new Set<string>()
    collectTildaUrls(JSON.parse(await readFile(path.join(dataDir, file), 'utf-8')), set)
    return set
  }

  it('каталог содержит 70 уникальных картинок tildacdn, статьи — 7', async () => {
    expect((await urlsIn('tilda-catalog.json')).size).toBe(70)
    expect((await urlsIn('tilda-articles.json')).size).toBe(7)
  })

  it('после подстановки карты в каталоге и статьях не остаётся tildacdn', async () => {
    for (const file of ['tilda-catalog.json', 'tilda-articles.json']) {
      const data = JSON.parse(await readFile(path.join(dataDir, file), 'utf-8')) as unknown
      const urls = new Set<string>()
      collectTildaUrls(data, urls)
      const map = new Map([...urls].map((u, i) => [u, `/uploads/tilda/${i}.png`]))
      const out = rewriteTildaUrls(data, map)
      const left = new Set<string>()
      collectTildaUrls(out.value, left)
      expect(left.size).toBe(0)
      expect(out.replaced).toBeGreaterThanOrEqual(urls.size)
    }
  })
})
