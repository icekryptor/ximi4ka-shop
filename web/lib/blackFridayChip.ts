/**
 * Чип «ЧП» («Чёрная пятница», 14.11–28.11.2026) на товарах со скидкой акции.
 *
 * Список товаров задан владельцем: шесть наборов. Чип появляется за день до
 * акции, 13.11, как анонс, и гаснет сам вместе с ней — страницы витрины
 * рендерятся на запрос. Границы по Москве; конец совпадает с баннером акции
 * (lib/blackFriday.ts в ветке баннера). После акции файл, компонент
 * BlackFridayChip и их вызовы можно удалить.
 */
export const BLACK_FRIDAY_CHIP = {
  /** первый момент показа чипа: 00:00 13.11 по Москве — за день до акции */
  startsAt: '2026-11-13T00:00:00+03:00',
  /** первый момент ПОСЛЕ акции: 00:00 29.11 по Москве (28.11 — последний день) */
  endsAt: '2026-11-29T00:00:00+03:00',
  /**
   * Химичка 3.0, Мини-химичка, Электрохимичка, ОГЭ, Химичка + Электрохимичка
   * и «Все наборы» (у комплекта два адреса: из трёх и из четырёх наборов).
   */
  slugs: [
    'himichka-30',
    'mini-himichka',
    'elektrohimichka',
    'bolshoi-nabor-dlya-oge',
    'himichka-i-elektrohimichka',
    'vse-tri-nabora',
    'vse-chetyre-nabora',
  ],
} as const

export function hasBlackFridayChip(slug: string, now: Date = new Date()): boolean {
  if (!(BLACK_FRIDAY_CHIP.slugs as readonly string[]).includes(slug)) return false
  // Посмотреть чип вне дат: BLACK_FRIDAY_PREVIEW=1 — только на dev-сервере.
  if (process.env.NODE_ENV === 'development' && process.env.BLACK_FRIDAY_PREVIEW === '1') {
    return true
  }
  const t = now.getTime()
  return t >= Date.parse(BLACK_FRIDAY_CHIP.startsAt) && t < Date.parse(BLACK_FRIDAY_CHIP.endsAt)
}
