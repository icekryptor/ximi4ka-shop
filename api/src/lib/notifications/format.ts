import type { DeliveryAddress, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'

// Что показываем людям в таблице и в чате. Чистые функции без сети — вся
// логика вида уведомлений тестируется здесь.

export interface NotifiableOrder {
  orderNumber: string
  status: OrderStatus
  createdAt: Date
  customerName: string
  customerPhone: string
  customerEmail: string
  customerTelegram: string | null
  deliveryMethod: string
  deliveryAddress: DeliveryAddress
  subtotalRub: number
  shippingRub: number
  totalRub: number
  items: {
    productSnapshot: { name: string; sku: string | null; priceRub: number }
    quantity: number
    unitPriceRub: number
  }[]
}

export const SHEET_HEADER = [
  '№ заказа',
  'Дата оформления',
  'ФИО',
  'Телефон',
  'Почта',
  'Telegram',
  'Доставка',
  'Состав',
  'Товары, ₽',
  'Доставка, ₽',
  'Итого, ₽',
  'Статус',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'создан',
  paid: 'оплачен',
  shipped: 'отправлен',
  cancelled: 'отменён',
  failed: 'оплата не прошла',
}

const STATUS_ICONS: Record<Exclude<OrderStatus, 'pending'>, string> = {
  paid: '✅',
  shipped: '📦',
  cancelled: '✖️',
  failed: '⚠️',
}

export const TELEGRAM_TEXT_LIMIT = 4096

// Дата и время по Москве. Собираем из частей сами: у Intl в ru-RU между
// датой и временем запятая, а нам нужен пробел.
function moscowParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

function formatDateTime(d: Date): string {
  const p = moscowParts(d)
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}

function formatShortDateTime(d: Date): string {
  const p = moscowParts(d)
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`
}

// Разряды обычным пробелом: у Intl.NumberFormat тонкий неразрывный, и
// результат зависит от версии ICU.
function rub(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

function formatPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/)
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Пользовательский текст в карточке ограничен: после экранирования «&» даёт
// пять символов, и длинные адрес с комментарием выталкивали карточку за лимит
// Telegram — 400, ошибка настройки, заказ не доходил совсем. Режем по
// символам (Array.from), чтобы не разорвать эмодзи пополам.
const CARD_TEXT_LIMIT = 300
const CARD_NAME_LIMIT = 100

function clip(s: string, limit: number): string {
  const chars = Array.from(s)
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : s
}

function pluralPositions(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'позиция'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'позиции'
  return 'позиций'
}

function itemLine(item: NotifiableOrder['items'][number]): string {
  const parts = [item.productSnapshot.name]
  if (item.productSnapshot.sku) parts.push(item.productSnapshot.sku)
  parts.push(`${item.quantity} × ${rub(item.unitPriceRub)}`)
  return parts.join(' · ')
}

function isPickupPoint(order: NotifiableOrder): boolean {
  return order.deliveryMethod === 'cdek_pvz'
}

function deliveryCell(order: NotifiableOrder): string {
  const { address, deliveryPointCode } = order.deliveryAddress
  if (isPickupPoint(order)) {
    return deliveryPointCode ? `ПВЗ ${deliveryPointCode} · ${address}` : `ПВЗ · ${address}`
  }
  return `Курьер · ${address}`
}

export function sheetRow(order: NotifiableOrder): (string | number)[] {
  return [
    order.orderNumber,
    formatDateTime(order.createdAt),
    order.customerName,
    order.customerPhone,
    order.customerEmail,
    order.customerTelegram ?? '',
    deliveryCell(order),
    order.items.map(itemLine).join('\n'),
    order.subtotalRub,
    order.shippingRub,
    order.totalRub,
    STATUS_LABELS[order.status],
  ]
}

export function telegramCard(order: NotifiableOrder): string {
  const contacts = [clip(order.customerName, CARD_NAME_LIMIT), formatPhone(order.customerPhone)]
  if (order.customerTelegram) contacts.push(order.customerTelegram)
  const { deliveryPointCode } = order.deliveryAddress
  const address = clip(order.deliveryAddress.address, CARD_TEXT_LIMIT)
  const comment = order.deliveryAddress.comment
    ? clip(order.deliveryAddress.comment, CARD_TEXT_LIMIT)
    : order.deliveryAddress.comment
  const where = isPickupPoint(order)
    ? `ПВЗ${deliveryPointCode ? ` ${deliveryPointCode}` : ''}: ${address}`
    : `Курьер: ${address}`
  const shipping =
    order.shippingRub === 0 ? 'доставка бесплатно' : `доставка ${rub(order.shippingRub)}`

  const head = [
    `🧪 <b>Новый заказ ${escapeHtml(order.orderNumber)}</b> · ${formatShortDateTime(order.createdAt)}`,
    escapeHtml(contacts.join(' · ')),
    escapeHtml(where),
  ]
  const tail = [`Товары ${rub(order.subtotalRub)} · ${shipping} · итого ${rub(order.totalRub)}`]
  if (comment) tail.push(`Комментарий: ${escapeHtml(comment)}`)
  tail.push(`Статус: ${STATUS_LABELS[order.status]}`)

  // Позиции добавляем, пока влезает в лимит, оставляя место на хвост и на
  // строку «…и ещё N позиций».
  const reserve = 40
  let length = [...head, ...tail].join('\n').length + reserve
  const lines: string[] = []
  for (const item of order.items) {
    const line = `— ${escapeHtml(itemLine(item))}`
    if (length + line.length + 1 > TELEGRAM_TEXT_LIMIT) break
    lines.push(line)
    length += line.length + 1
  }
  const hidden = order.items.length - lines.length
  if (hidden > 0) lines.push(`— …и ещё ${hidden} ${pluralPositions(hidden)}`)

  return [...head, ...lines, ...tail].join('\n')
}

export function telegramStatusLine(
  orderNumber: string,
  eventKey: Exclude<OrderEventKey, 'created'>,
  standalone: boolean,
): string {
  const status = eventKey.slice('status:'.length) as Exclude<OrderStatus, 'pending'>
  const label = STATUS_LABELS[status]
  return standalone
    ? `${STATUS_ICONS[status]} Заказ ${escapeHtml(orderNumber)}: ${label}`
    : `${STATUS_ICONS[status]} ${label}`
}
