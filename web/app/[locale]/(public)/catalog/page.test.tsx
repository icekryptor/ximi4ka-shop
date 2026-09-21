import { describe, it, expect } from 'vitest'
import CatalogPage, { revalidate } from './page'

describe('CatalogPage', () => {
  it('is an async Server Component', () => {
    expect(CatalogPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

})
