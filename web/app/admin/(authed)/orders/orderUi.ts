import type { OrderStatus, PaymentProvider } from '@ximi4ka-shop/shared'

// Russian labels + badge styling shared by the orders list and detail pages.

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
  cancelled: 'Отменён',
}

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-brand-bg-soft text-brand-text-secondary',
}

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual: 'Вручную',
  tbank: 'Т-Касса',
}

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  cdek_pvz: 'СДЭК — пункт выдачи',
  cdek_courier: 'СДЭК — курьер',
}

export const HISTORY_ACTOR_LABELS: Record<string, string> = {
  tbank: 'Т-Касса',
  admin: 'Менеджер',
  reconcile: 'Сверка платежей',
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`
}
