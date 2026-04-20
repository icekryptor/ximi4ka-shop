import { describe, it, expect } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import type { Block } from '@ximi4ka-shop/shared'
import { blockDefault } from './blockDefaults'

const types: Block['type'][] = [
  'paragraph',
  'image',
  'gallery',
  'layout',
  'cta',
  'video',
  'faq',
  'product_grid',
]

describe('blockDefault', () => {
  for (const t of types) {
    it(`produces a valid default for ${t} that passes isBlock`, () => {
      const b = blockDefault(t)
      expect(b.type).toBe(t)
      expect(isBlock(b)).toBe(true)
    })
  }

  it('paragraph default has html', () => {
    const b = blockDefault('paragraph')
    expect(b).toMatchObject({ type: 'paragraph', html: expect.any(String) })
  })

  it('image default has empty url and alt', () => {
    expect(blockDefault('image')).toMatchObject({
      type: 'image',
      url: '',
      alt: '',
      caption: null,
    })
  })

  it('gallery default has empty images array', () => {
    expect(blockDefault('gallery')).toMatchObject({
      type: 'gallery',
      images: [],
    })
  })

  it('layout default uses text-left variant', () => {
    expect(blockDefault('layout')).toMatchObject({
      type: 'layout',
      variant: 'text-left',
    })
  })

  it('cta default has placeholder copy', () => {
    expect(blockDefault('cta')).toMatchObject({
      type: 'cta',
      heading: 'Заголовок',
      buttonLabel: 'Кнопка',
    })
  })

  it('video default uses youtube provider', () => {
    expect(blockDefault('video')).toMatchObject({
      type: 'video',
      provider: 'youtube',
    })
  })

  it('faq default has one empty item', () => {
    expect(blockDefault('faq')).toMatchObject({
      type: 'faq',
      items: [{ question: '', answer: '' }],
    })
  })

  it('product_grid default has empty slugs', () => {
    expect(blockDefault('product_grid')).toMatchObject({
      type: 'product_grid',
      productSlugs: [],
      heading: null,
    })
  })
})
