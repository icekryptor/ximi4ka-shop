/**
 * Акция «Чёрная пятница — цены 2023 года» (14.11–28.11.2026).
 *
 * Слайд на главной и лента над шапкой включаются с 13.11 (анонс за день до цен) и гаснут сами:
 * страницы витрины рендерятся на запрос, поэтому сравнения с текущим временем
 * достаточно. Границы заданы по Москве и не зависят от пояса сервера.
 * После акции файл и всё, что на него ссылается, можно удалить.
 */
export const BLACK_FRIDAY = {
  /** баннер и лента включаются с 00:00 13.11 по Москве — за день до цен, как анонс */
  startsAt: '2026-11-13T00:00:00+03:00',
  /** первый момент ПОСЛЕ акции: 00:00 29.11 по Москве (28.11 — последний день) */
  endsAt: '2026-11-29T00:00:00+03:00',
  /** куда ведут баннер и лента — страница распродажи: наборы и комбо */
  href: '/sale',
  titleLines: ['Чёрная пятница.', 'Цены 2023 года.'],
  lead: 'Мы ещё такого не делали — с 14.11 по 28.11 цены на наборы 2023 года',
  cta: 'Налетай!',
  /** фразы бегущей ленты над шапкой */
  tapeItems: ['Чёрная пятница', 'Цены 2023 года на наборы', 'С 14.11 по 28.11', 'Налетай!'],
} as const

export function isBlackFridayActive(now: Date = new Date()): boolean {
  // Посмотреть баннер до старта: BLACK_FRIDAY_PREVIEW=1 — только на dev-сервере.
  if (process.env.NODE_ENV === 'development' && process.env.BLACK_FRIDAY_PREVIEW === '1') {
    return true
  }
  const t = now.getTime()
  return t >= Date.parse(BLACK_FRIDAY.startsAt) && t < Date.parse(BLACK_FRIDAY.endsAt)
}

/**
 * Комбо, которые владелец завёл в админке 13.11.2026, но которые не лежат ни в
 * одной категории: страница распродажи подтягивает их по слагу. Сид
 * `npm run apply:sale-combos -w api` кладёт их в категорию «Комбо»; после него
 * они придут и из категории — дубли отбрасывает `orderSaleCombos`.
 */
export const SALE_EXTRA_COMBO_SLUGS = ['all-4-kits', 'zapas-reaktivov-1'] as const

/** Порядок комбо на странице распродажи: от самого крупного. Прочие — следом. */
const SALE_COMBO_ORDER = [
  'all-4-kits',
  'vse-tri-nabora',
  'himichka-i-elektrohimichka',
  'zapas-vseh-reaktivov',
  'zapas-reaktivov-1',
] as const

/** Склеивает комбо из категории и дополнительные, без дублей, в порядке акции. */
export function orderSaleCombos<T extends { slug: string }>(lists: readonly T[][]): T[] {
  const bySlug = new Map<string, T>()
  for (const list of lists) for (const p of list) if (!bySlug.has(p.slug)) bySlug.set(p.slug, p)
  const rank = (slug: string) => {
    const i = (SALE_COMBO_ORDER as readonly string[]).indexOf(slug)
    return i === -1 ? SALE_COMBO_ORDER.length : i
  }
  return [...bySlug.values()].sort((a, b) => rank(a.slug) - rank(b.slug))
}
