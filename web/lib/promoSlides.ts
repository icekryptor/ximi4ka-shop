/**
 * Слайды промо-слайдера первого экрана. Тексты зашиты в код: это короткие
 * акционные плашки, а не CMS-контент. Фото набора ОГЭ подставляется с
 * сервера (из DB-продукта) — без него слайд рисует иллюстрацию.
 */
export type PromoVisual = 'gift' | 'product' | 'platform'

export interface PromoCta {
  label: string
  href: string
  /** внешняя ссылка — открываем в новой вкладке */
  external?: boolean
}

export interface PromoSlide {
  id: string
  /** метка над заголовком: «Акция», «Новинка» … */
  eyebrow: string
  title: string
  lead: string
  cta: PromoCta
  visual: PromoVisual
  /** фото для visual = 'product' */
  imageUrl?: string
  imageAlt?: string
}

export const OGE_PRODUCT_SLUG = 'bolshoi-nabor-dlya-oge'
export const LEARN_URL = 'https://learn.ximi4ka.ru'

export function buildPromoSlides(oge: { imageUrl: string; alt: string } | null): PromoSlide[] {
  return [
    {
      id: 'gift',
      eyebrow: 'Акция',
      title: 'Реактив в подарок',
      lead: 'В честь запуска нового сайта добавим к заказу реактив в подарок — на ваш выбор.',
      cta: { label: 'Выбрать набор', href: '/catalog' },
      visual: 'gift',
    },
    {
      id: 'oge',
      eyebrow: 'Новинка',
      title: 'Химичка ОГЭ',
      lead: 'Новый набор в новой коробке и с методичкой. На сайте дешевле.',
      cta: { label: 'Смотреть набор', href: `/product/${OGE_PRODUCT_SLUG}` },
      visual: 'product',
      imageUrl: oge?.imageUrl,
      imageAlt: oge?.alt,
    },
    {
      id: 'learn',
      eyebrow: 'Учебная платформа',
      title: 'learn.ximi4ka.ru',
      lead: 'Делайте эксперименты и учитесь онлайн.',
      cta: { label: 'Открыть платформу', href: LEARN_URL, external: true },
      visual: 'platform',
    },
  ]
}
