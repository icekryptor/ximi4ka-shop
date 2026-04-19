import { describe, it, expect } from 'vitest'
import { isBlock } from './blocks.js'

describe('isBlock', () => {
  it('accepts every known block type', () => {
    const samples = [
      { type: 'paragraph', html: '<p>x</p>' },
      { type: 'image', url: 'x', alt: 'x' },
      { type: 'gallery', images: [] },
      { type: 'layout', variant: 'text-left', text: { html: '' }, image: { url: '', alt: '' } },
      { type: 'cta', heading: 'x', buttonLabel: 'x', buttonHref: '/' },
      { type: 'video', provider: 'youtube', videoId: 'abc' },
      { type: 'faq', items: [] },
      { type: 'product_grid', productSlugs: [] },
    ]
    for (const s of samples) {
      expect(isBlock(s)).toBe(true)
    }
  })

  it('rejects unknown type strings', () => {
    expect(isBlock({ type: 'unknown' })).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(isBlock(null)).toBe(false)
    expect(isBlock(undefined)).toBe(false)
    expect(isBlock('paragraph')).toBe(false)
    expect(isBlock(42)).toBe(false)
  })

  it('rejects objects without a type field', () => {
    expect(isBlock({})).toBe(false)
    expect(isBlock({ html: 'x' })).toBe(false)
  })

  it('rejects objects where type is not a string', () => {
    expect(isBlock({ type: 123 })).toBe(false)
  })
})
