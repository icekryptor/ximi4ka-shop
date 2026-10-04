import { describe, it, expect } from 'vitest'
import CatalogPage, { generateMetadata, revalidate } from './page'

describe('CatalogPage', () => {
  it('is an async Server Component', () => {
    expect(CatalogPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('отдаёт title с брендом «Химичка»', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta.title).toBe('Каталог наборов, реактивов и оборудования — Химичка')
  })
})
