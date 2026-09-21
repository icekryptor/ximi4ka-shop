import { describe, it, expect } from 'vitest'
import CategoryDetailPage, { dynamic } from './page'

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
})
