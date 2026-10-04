import { describe, it, expect } from 'vitest'
import CategoriesListPage, { generateMetadata, revalidate } from './page'
import { generateMetadata as catalogMetadata } from '../catalog/page'

describe('CategoriesListPage', () => {
  it('is an async Server Component', () => {
    expect(CategoriesListPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('title с брендом «Химичка» и не совпадает с title каталога', async () => {
    const params = Promise.resolve({ locale: 'ru' })
    const meta = await generateMetadata({ params })
    const catalog = await catalogMetadata({ params })
    expect(meta.title).toBe('Категории наборов для химических опытов — Химичка')
    expect(meta.title).not.toBe(catalog.title)
  })
})
