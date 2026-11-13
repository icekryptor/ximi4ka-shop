/**
 * Слайды промо-слайдера первого экрана. Тексты и градиенты зашиты в код и
 * повторяют три баннера из Figma («Химичка — витрина», страница «баннеры»,
 * узлы 144:4627 / 144:4642 / 144:4664): это короткие акционные плашки, а не
 * CMS-контент.
 */
import { BLACK_FRIDAY, isBlackFridayActive } from './blackFriday'

export type PromoVisual = 'gift' | 'oge' | 'learn' | 'blackFriday'
/** оформление слайда: `hazard` — чёрный с оранжево-жёлтым свечением и лентами */
export type PromoTheme = 'hazard'

export interface PromoCta {
  label: string
  href: string
  /** внешняя ссылка — открываем в новой вкладке */
  external?: boolean
}

export interface PromoSlide {
  id: string
  /** строки заголовка — разрыв строки задан макетом */
  titleLines: string[]
  /** абзацы лида; в макете у баннера ОГЭ это две отдельные строки */
  leadLines: string[]
  /** ширина лида в px макета (1440); без неё лид тянется на всю колонку 680 */
  leadWidth?: number
  cta: PromoCta
  visual: PromoVisual
  /** CSS-градиент подложки баннера */
  background: string
  /** особое оформление текста и кнопки; без него — белый текст на градиенте */
  theme?: PromoTheme
}

export const OGE_PRODUCT_SLUG = 'bolshoi-nabor-dlya-oge'
export const LEARN_URL = 'https://learn.ximi4ka.ru'

/** Общий заголовок слайда одной строкой — для aria-label и тестов. */
export function slideTitle(slide: PromoSlide): string {
  return slide.titleLines.join(' ')
}

/** Слайд «Чёрной пятницы» — показывается только в даты акции, первым. */
function blackFridaySlide(): PromoSlide {
  return {
    id: 'black-friday',
    titleLines: [...BLACK_FRIDAY.titleLines],
    leadLines: [BLACK_FRIDAY.lead],
    leadWidth: 560,
    cta: { label: BLACK_FRIDAY.cta, href: BLACK_FRIDAY.href },
    visual: 'blackFriday',
    background:
      'radial-gradient(120% 90% at 78% 50%, #2a1500 0%, #120a02 38%, #050505 72%), #050505',
    theme: 'hazard',
  }
}

export function buildPromoSlides(now: Date = new Date()): PromoSlide[] {
  return [
    ...(isBlackFridayActive(now) ? [blackFridaySlide()] : []),
    {
      id: 'gift',
      titleLines: ['Реактив в подарок', 'за заказ от 3000 руб'],
      leadLines: [
        'В честь запуска нового сайта мы дарим любой реактив на выбор за заказ от 3000 рублей + скидки на все товары!',
      ],
      cta: { label: 'В каталог', href: '/catalog' },
      visual: 'gift',
      background: 'linear-gradient(242.14deg, var(--color-lj-bright-start) 0%, #130b2c 99.945%)',
    },
    {
      id: 'oge',
      titleLines: ['Новый набор:', 'Химичка ОГЭ'],
      leadLines: [
        '29 реактивов и подробное методическое пособие',
        'Доступ на месяц к учебной платформе к модулю ОГЭ',
      ],
      cta: { label: 'Подробнее', href: `/product/${OGE_PRODUCT_SLUG}` },
      visual: 'oge',
      background: 'linear-gradient(62.47deg, #363143 1.1133%, #a5f896 93.091%)',
    },
    {
      id: 'learn',
      titleLines: ['Наша обучающая', 'платформа'],
      leadLines: [
        'Мы создали обучающую платформу с объяснением теории и интересными упражнениями по химии, уже открыта регистрация и оформление пробного периода',
      ],
      leadWidth: 557.08,
      cta: { label: 'Подробнее', href: LEARN_URL, external: true },
      visual: 'learn',
      background: 'linear-gradient(62.47deg, #363143 1.1133%, #8a5eb3 93.091%)',
    },
  ]
}
