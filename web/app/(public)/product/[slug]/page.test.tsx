import { describe, it, expect } from 'vitest'
import ProductPage, { revalidate, generateStaticParams } from './page'

describe('ProductPage', () => {
  it('is an async Server Component', () => {
    expect(ProductPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('exports generateStaticParams as a function', () => {
    expect(typeof generateStaticParams).toBe('function')
  })
})
