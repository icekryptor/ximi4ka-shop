import { describe, it, expect } from 'vitest'
import HomePage, { revalidate } from './page'

describe('HomePage', () => {
  it('is an async Server Component', () => {
    // HomePage fetches data, so it must be declared `async`.
    expect(HomePage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })
})
