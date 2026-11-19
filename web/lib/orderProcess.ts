import { CIS_DELIVERY_RULES } from '@ximi4ka-shop/shared/types/cis'
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

export function orderProcessPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? ORDER_PROCESS_PATH : `/${locale}${ORDER_PROCESS_PATH}`
}

export function buildDeliveryZones(): DeliveryZone[] {
  const pvz = formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)
  const courier = formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)
  const { BY, KZ, AM } = CIS_DELIVERY_RULES
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
      condition: `Бесплатно от ${formatRub(BY.freeFromRub)}, иначе ${formatRub(BY.priceRub)}`,
    },
    {
      id: 'eaeu',
      label: 'Другие страны ЕАЭС',
      countries: [
        { code: 'kz', name: 'Казахстан' },
        { code: 'am', name: 'Армения' },
        { code: 'kg', name: 'Киргизия' },
      ],
      condition: `Бесплатно от ${formatRub(KZ.freeFromRub)}, иначе ${formatRub(KZ.priceRub)} (Казахстан, Киргизия), ${formatRub(AM.priceRub)} (Армения)`,
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

/** Якорь гайда на /order-process — на него ведёт баннер каталога. */
export const EAEU_GUIDE_ID = 'eaeu-guide'
export const EAEU_GUIDE_TITLE = 'Как заказать в Беларусь, Казахстан, Армению и Киргизию'
export const EAEU_GUIDE_HREF = `${ORDER_PROCESS_PATH}#${EAEU_GUIDE_ID}`

export interface EaeuGuideStep {
  title: string
  text: string
}

/** Шаги совпадают с чекаутом: переключатель «Куда доставить», страна, город, адрес ПВЗ, оплата. */
export const EAEU_GUIDE_STEPS: EaeuGuideStep[] = [
  {
    title: 'Оформите заказ',
    text: 'Соберите корзину и перейдите к оформлению. Email обязателен: на него придёт чек.',
  },
  {
    title: 'Выберите доставку в эти страны',
    text: 'В блоке «Куда доставить» отметьте «Беларусь, Казахстан, Армения, Киргизия».',
  },
  {
    title: 'Выберите страну и город',
    text: 'Город выбирается из списка. Если вашего города в нём нет, доставка туда пока невозможна.',
  },
  {
    title: 'Впишите адрес пункта выдачи',
    text: 'Адрес пункта выдачи СДЭК пишется вручную. Ближайший пункт можно найти на cdek.ru.',
  },
  {
    title: 'Оплатите заказ онлайн',
    text: 'Подходящие карты перечислены ниже.',
  },
]

export interface EaeuCardRule {
  card: string
  accepted: boolean
}

/** Какие карты принимаем для доставки в эти страны (Т-Касса, рубли). */
export const EAEU_CARD_RULES: EaeuCardRule[] = [
  { card: 'Visa и Mastercard, выпущенные в России', accepted: true },
  { card: '«Мир», выпущенные в Беларуси, Казахстане, Армении и Киргизии', accepted: true },
  {
    card: 'Visa и Mastercard, выпущенные в Беларуси, Казахстане, Армении и Киргизии',
    accepted: false,
  },
]

/** Короткое предупреждение в чекауте — до выбора страны. */
export const CIS_PAYMENT_NOTE =
  'Оплата: картами Visa и Mastercard, выпущенными в России, или картами «Мир», выпущенными в Беларуси, Казахстане, Армении и Киргизии. Карты Visa и Mastercard этих стран пока не принимаются — мы работаем над этой возможностью.'

/** Плашка в чекауте, когда карты банков стран ЕАЭС принимаются через CloudPayments. */
export const CIS_PAYMENT_NOTE_FOREIGN_CARDS =
  'Оплата: картами «Мир» и российскими Visa и Mastercard — как обычно; картами Visa и Mastercard банков Беларуси, Казахстана, Армении и Киргизии — отдельным способом, выберите его перед оформлением заказа.'

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
      'Для Беларуси, Казахстана, Армении и Киргизии в оформлении заказа выберите регион «Беларусь, Казахстан, Армения, Киргизия», затем выберите страну и город из списка и впишите адрес пункта выдачи СДЭК. Если вашего города нет в списке, доставка туда пока невозможна. Пошаговая инструкция и способы оплаты — в разделе «Как заказать в Беларусь, Казахстан, Армению и Киргизию» ниже.',
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
