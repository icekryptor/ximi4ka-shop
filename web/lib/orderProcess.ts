import { SHIPPING_RULES } from '@/lib/checkout'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { formatRub } from '@/lib/stockLabel'

// Содержание блока «Заказ и доставка» (главная) и страницы /order-process.
// Условия и сроки — от владельца (16.10.2026), в спеке
// docs/superpowers/specs/2026-10-16-order-process-design.md. Порог РФ читаем из
// SHIPPING_RULES в момент вызова, чтобы текст не разошёлся с чекаутом.

export type FlagCode = 'ru' | 'by' | 'kz' | 'am' | 'kg' | 'uz' | 'az' | 'tj'

export interface Screenshot {
  src: string
  alt: string
  caption: string
  width: number
  height: number
}

export interface OrderStep {
  index: 1 | 2 | 3 | 4
  title: string
  /** Короткий текст для карточки на главной. */
  summary: string
  /** Абзацы для страницы. */
  details: string[]
  screenshots: Screenshot[]
}

export interface DeliveryCountry {
  code: FlagCode
  name: string
}

export interface DeliveryZone {
  id: 'ru' | 'by' | 'eaeu' | 'cis'
  label: string
  countries: DeliveryCountry[]
  condition: string
}

export interface CdekTerm {
  region: string
  days: string
}

/** Все скриншоты снимаются и сжимаются до этого размера. */
export const SCREEN_SIZE = { width: 1200, height: 750 } as const

export const ORDER_PROCESS_PATH = '/order-process'

// Беларусь — как Россия до пункта выдачи, прочие страны ЕАЭС — как курьер по России.
const BELARUS_FREE_FROM_RUB = 3000
const EAEU_FREE_FROM_RUB = 5000

export function orderProcessPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? ORDER_PROCESS_PATH : `/${locale}${ORDER_PROCESS_PATH}`
}

export function buildDeliveryZones(): DeliveryZone[] {
  const pvz = formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)
  const courier = formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)
  return [
    {
      id: 'ru',
      label: 'Россия',
      countries: [{ code: 'ru', name: 'Россия' }],
      condition: `Бесплатно от ${pvz} до пункта выдачи, курьером — от ${courier}`,
    },
    {
      id: 'by',
      label: 'Беларусь',
      countries: [{ code: 'by', name: 'Беларусь' }],
      condition: `Бесплатно от ${formatRub(BELARUS_FREE_FROM_RUB)}`,
    },
    {
      id: 'eaeu',
      label: 'Другие страны ЕАЭС',
      countries: [
        { code: 'kz', name: 'Казахстан' },
        { code: 'am', name: 'Армения' },
        { code: 'kg', name: 'Киргизия' },
      ],
      condition: `Бесплатно от ${formatRub(EAEU_FREE_FROM_RUB)}`,
    },
    {
      id: 'cis',
      label: 'СНГ',
      countries: [
        { code: 'uz', name: 'Узбекистан' },
        { code: 'az', name: 'Азербайджан' },
        { code: 'tj', name: 'Таджикистан' },
      ],
      condition: 'Доставка оплачивается отдельно',
    },
  ]
}

export const CDEK_TERMS: CdekTerm[] = [
  { region: 'Москва и Московская область, Ленинградская область', days: '2–3 дня' },
  { region: 'Европейская часть России, Кавказ', days: '3–5 дней' },
  { region: 'Сибирь, Забайкалье, Дальний Восток', days: '7–10 дней' },
]

const SHOT = { ...SCREEN_SIZE }

export const ORDER_STEPS: OrderStep[] = [
  {
    index: 1,
    title: 'Соберите корзину, оформите заказ и оплатите',
    summary: 'Бесплатная доставка зависит от страны и суммы заказа: условия ниже.',
    details: [
      'Добавьте наборы и реактивы в корзину. Полоска в корзине показывает, сколько осталось до бесплатной доставки.',
      'В оформлении заказа выберите город, способ получения — пункт выдачи СДЭК или курьер — и пункт выдачи или адрес, затем оплатите заказ онлайн.',
      'Условия бесплатной доставки зависят от страны:',
    ],
    screenshots: [
      {
        src: '/img/order-process/cart.webp',
        alt: 'Корзина магазина Химичка: список товаров и полоска «До бесплатной доставки осталось»',
        caption: 'Корзина: полоска до бесплатной доставки',
        ...SHOT,
      },
      {
        src: '/img/order-process/checkout.webp',
        alt: 'Оформление заказа: выбор способа доставки СДЭК, пункта выдачи и стоимость доставки',
        caption: 'Оформление заказа: способ доставки и пункт выдачи СДЭК',
        ...SHOT,
      },
    ],
  },
  {
    index: 2,
    title: 'Данные о доставке — на странице заказа и в кабинете',
    summary:
      'После оплаты трек СДЭК виден на странице заказа, а способ, адрес и трек — в личном кабинете.',
    details: [
      'Сразу после оплаты откроется страница заказа: статус, сумма и трек-номер СДЭК со ссылкой «Отследить на cdek.ru». Трек появляется, как только заказ передан в СДЭК.',
      'В личном кабинете, в истории заказов, у каждого заказа видны состав, способ и адрес доставки и ссылка «Отследить посылку».',
    ],
    screenshots: [
      {
        src: '/img/order-process/order-page.webp',
        alt: 'Страница заказа после оплаты: статус «Оплачен», сумма и трек-номер СДЭК со ссылкой на отслеживание',
        caption: 'Страница заказа после оплаты',
        ...SHOT,
      },
      {
        src: '/img/order-process/account.webp',
        alt: 'Личный кабинет: история заказов с раскрытым заказом, адресом доставки и ссылкой на отслеживание',
        caption: 'Личный кабинет: заказ с данными о доставке',
        ...SHOT,
      },
    ],
  },
  {
    index: 3,
    title: 'Отправляем в течение суток',
    summary: 'Товары, которые есть на складе, мы передаём в службу доставки в течение суток.',
    details: [
      'Товары, которые есть на складе, мы передаём в службу доставки в течение суток после оформления заказа.',
    ],
    screenshots: [],
  },
  {
    index: 4,
    title: 'Средние сроки доставки СДЭК',
    summary: 'От двух до десяти дней в зависимости от региона.',
    details: [
      'Сроки средние. Точный срок до вашего города покажет оформление заказа, когда вы выберете доставку.',
    ],
    screenshots: [],
  },
]
