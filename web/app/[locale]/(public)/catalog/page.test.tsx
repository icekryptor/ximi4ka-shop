import { describe, it, expect } from 'vitest'
import CatalogPage, { revalidate, generateStaticParams } from './page'

describe('CatalogPage', () => {
  it('is an async Server Component', () => {
    expect(CatalogPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('exports generateStaticParams for every supported locale', () => {
    const params = generateStaticParams()
    expect(params).toEqual([{ locale: 'ru' }, { locale: 'en' }])
  })
})
