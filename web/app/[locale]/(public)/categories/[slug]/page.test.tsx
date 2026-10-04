import { describe, it, expect, vi, afterEach } from 'vitest'
import CategoryDetailPage, { dynamic, generateMetadata } from './page'
import * as api from '@/lib/api'

describe('CategoryDetailPage', () => {
  it('is an async Server Component', () => {
    expect(CategoryDetailPage.constructor.name).toBe('AsyncFunction')
  })

  // Страница читает searchParams (сортировка, страница), поэтому её нельзя
  // отдавать из ISR-кеша: при рендере по запросу Next падает с
  // DYNAMIC_SERVER_USAGE (500), если слаг не был пререндерен на сборке — а на
  // своём сервере образ собирается без доступа к api, то есть пререндера нет.
  it('stays dynamic because it reads searchParams', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  describe('generateMetadata', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const params = Promise.resolve({ locale: 'ru', slug: 'kits' })
    const category = (overrides: Record<string, unknown> = {}) =>
      ({
        id: 'c1',
        slug: 'kits',
        name: 'Наборы',
        translations: {},
        ...overrides,
      }) as unknown as Awaited<ReturnType<typeof api.getCategory>>

    it('добавляет бренд к названию категории, чтобы title не повторял H1', async () => {
      vi.spyOn(api, 'getCategory').mockResolvedValue(category())
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe('Наборы — Химичка')
    })

    it('не добавляет бренд, если итог длиннее 65 символов', async () => {
      const name = 'Очень длинное название категории химических наборов для школьников'
      vi.spyOn(api, 'getCategory').mockResolvedValue(category({ name }))
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe(name)
    })
  })
})
