/**
 * Тип одного слайда hero-слайдера (v3.5). Данные приходят с сервера —
 * каждый слайд резолвится из реального DB-продукта на главной
 * (см. web/app/[locale]/(public)/page.tsx, flagships → heroSlides).
 */
export interface HeroSlide {
  /** id продукта — нужен для добавления в корзину */
  productId: string
  slug: string
  name: string
  /** цена в рублях, форматируется в компоненте */
  priceRub: number
  imageUrl: string
  alt: string
  /** ссылка на карточку товара */
  href: string
  /** моно-подпись слева сверху (fig. NNN — …) */
  label: string
}

/**
 * Форматирует цену: 3399 → "3 399" (неразрывные пробелы как разделители
 * тысяч, ru-RU). Совпадает с логикой ProductCard / amp.ts, чтобы цена
 * читалась одинаково по всему сайту.
 */
export function formatPriceRub(priceRub: number): string {
  return priceRub.toLocaleString('ru-RU').replace(/,/g, ' ')
}
