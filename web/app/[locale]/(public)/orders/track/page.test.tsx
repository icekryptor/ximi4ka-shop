import { describe, it, expect } from 'vitest'
import { metadata } from './page'

describe('TrackOrderPage metadata', () => {
  it('закрыта от индекса и не выдаёт canonical/hreflang/OG', () => {
    expect(metadata.title).toBe('Отследить заказ — Химичка')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.openGraph).toBeUndefined()
    expect(metadata.twitter).toBeUndefined()
  })
})
