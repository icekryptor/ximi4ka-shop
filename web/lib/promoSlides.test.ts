import { describe, it, expect } from 'vitest'
import { buildPromoSlides, LEARN_URL, OGE_PRODUCT_SLUG } from './promoSlides'

describe('buildPromoSlides', () => {
  it('returns the three promo slides in order: gift, ОГЭ, learn', () => {
    const slides = buildPromoSlides(null)
    expect(slides.map((s) => s.id)).toEqual(['gift', 'oge', 'learn'])
    expect(slides.map((s) => s.title)).toEqual([
      'Реактив в подарок',
      'Химичка ОГЭ',
      'learn.ximi4ka.ru',
    ])
  })

  it('links the ОГЭ slide to the product and the learn slide to the platform', () => {
    const [, oge, learn] = buildPromoSlides(null)
    expect(oge.cta.href).toBe(`/product/${OGE_PRODUCT_SLUG}`)
    expect(learn.cta.href).toBe(LEARN_URL)
    expect(learn.cta.external).toBe(true)
  })

  it('passes the product photo to the ОГЭ slide only', () => {
    const slides = buildPromoSlides({ imageUrl: '/img/oge.jpg', alt: 'Химичка ОГЭ' })
    expect(slides[1].imageUrl).toBe('/img/oge.jpg')
    expect(slides[0].imageUrl).toBeUndefined()
  })
})
