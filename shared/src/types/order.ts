export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled'
export type PaymentProvider = 'yandex_pay'

export interface OrderItemSnapshot {
  name: string
  sku: string | null
  priceRub: number
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  productSnapshot: OrderItemSnapshot
  quantity: number
  unitPriceRub: number
}

export interface DeliveryAddress {
  street: string
  city: string
  postal: string
  notes: string | null
}

export interface OrderDto {
  id: string
  orderNumber: string
  status: OrderStatus
  customerName: string
  customerPhone: string
  customerEmail: string
  deliveryAddress: DeliveryAddress
  deliveryMethod: string
  subtotalRub: number
  shippingRub: number
  totalRub: number
  paymentProvider: PaymentProvider
  paymentIntentId: string | null
  items: OrderItem[]
  createdAt: string
  paidAt: string | null
  erpSyncedAt: string | null
}
