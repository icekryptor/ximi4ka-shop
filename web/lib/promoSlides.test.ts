import { describe, it, expect } from 'vitest'
import { buildPromoSlides, LEARN_URL, OGE_PRODUCT_SLUG, slideTitle } from './promoSlides'

describe('buildPromoSlides', () => {
  it('returns the three banners from Figma in order: gift, ОГЭ, learn', () => {
    const slides = buildPromoSlides()
    expect(slides.map((s) => s.id)).toEqual(['gift', 'oge', 'learn'])
    expect(slides.map(slideTitle)).toEqual([
      'Реактив в подарок за заказ от 3000 руб',
      'Новый набор: Химичка ОГЭ',
      'Наша обучающая платформа',
    ])
  })

  it('keeps the line breaks of the headings from the design', () => {
    const slides = buildPromoSlides()
    expect(slides.map((s) => s.titleLines.length)).toEqual([2, 2, 2])
  })

  it('links the gift slide to the catalog, ОГЭ to the product and learn to the platform', () => {
    const [gift, oge, learn] = buildPromoSlides()
    expect(gift.cta).toEqual({ label: 'В каталог', href: '/catalog' })
    expect(oge.cta.href).toBe(`/product/${OGE_PRODUCT_SLUG}`)
    expect(learn.cta.href).toBe(LEARN_URL)
    expect(learn.cta.external).toBe(true)
  })

  it('gives every banner its own gradient', () => {
    const backgrounds = buildPromoSlides().map((s) => s.background)
    expect(new Set(backgrounds).size).toBe(3)
    backgrounds.forEach((b) => expect(b).toContain('linear-gradient'))
  })
})
