import { describe, it, expect } from 'vitest'
import { buildPromoSlides, LEARN_URL, OGE_PRODUCT_SLUG, slideTitle } from './promoSlides'

// Вне акции «Чёрная пятница» — обычные три баннера.
const OFF_SEASON = new Date('2026-10-01T12:00:00+03:00')
const IN_BLACK_FRIDAY = new Date('2026-11-20T12:00:00+03:00')

describe('buildPromoSlides', () => {
  it('returns the three banners from Figma in order: gift, ОГЭ, learn', () => {
    const slides = buildPromoSlides(OFF_SEASON)
    expect(slides.map((s) => s.id)).toEqual(['gift', 'oge', 'learn'])
    expect(slides.map(slideTitle)).toEqual([
      'Реактив в подарок за заказ от 3000 руб',
      'Новый набор: Химичка ОГЭ',
      'Наша обучающая платформа',
    ])
  })

  it('keeps the line breaks of the headings from the design', () => {
    const slides = buildPromoSlides(OFF_SEASON)
    expect(slides.map((s) => s.titleLines.length)).toEqual([2, 2, 2])
  })

  it('links the gift slide to the catalog, ОГЭ to the product and learn to the platform', () => {
    const [gift, oge, learn] = buildPromoSlides(OFF_SEASON)
    expect(gift.cta).toEqual({ label: 'В каталог', href: '/catalog' })
    expect(oge.cta.href).toBe(`/product/${OGE_PRODUCT_SLUG}`)
    expect(learn.cta.href).toBe(LEARN_URL)
    expect(learn.cta.external).toBe(true)
  })

  it('gives every banner its own gradient', () => {
    const backgrounds = buildPromoSlides(OFF_SEASON).map((s) => s.background)
    expect(new Set(backgrounds).size).toBe(3)
    backgrounds.forEach((b) => expect(b).toContain('linear-gradient'))
  })

  it('ставит «Чёрную пятницу» первым слайдом на время акции', () => {
    const slides = buildPromoSlides(IN_BLACK_FRIDAY)
    expect(slides.map((s) => s.id)).toEqual(['black-friday', 'gift', 'oge', 'learn'])
    const [bf] = slides
    expect(slideTitle(bf)).toBe('Чёрная пятница. Цены 2023 года.')
    expect(bf.leadLines).toEqual([
      'Мы ещё такого не делали — с 14.11 по 28.11 цены на наборы 2023 года',
    ])
    expect(bf.cta).toEqual({ label: 'Налетай!', href: '/categories/kits' })
    expect(bf.theme).toBe('hazard')
  })

  it('после акции слайда «Чёрной пятницы» нет', () => {
    const ids = buildPromoSlides(new Date('2026-11-29T00:00:00+03:00')).map((s) => s.id)
    expect(ids).not.toContain('black-friday')
  })
})
