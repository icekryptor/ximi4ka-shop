import { describe, it, expect } from 'vitest'
import CategoryDetailPage, { revalidate, generateStaticParams } from './page'

describe('CategoryDetailPage', () => {
  it('is an async Server Component', () => {
    expect(CategoryDetailPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('exports generateStaticParams as a function', () => {
    expect(typeof generateStaticParams).toBe('function')
  })
})
