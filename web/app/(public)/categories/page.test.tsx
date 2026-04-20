import { describe, it, expect } from 'vitest'
import CategoriesListPage, { revalidate } from './page'

describe('CategoriesListPage', () => {
  it('is an async Server Component', () => {
    expect(CategoriesListPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })
})
