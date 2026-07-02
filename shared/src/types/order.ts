export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled'

// Payment provider actually wired to the order. `manual` — no online payment:
// the order stays pending and a manager contacts the customer. `tbank` —
// Т-Касса (Т-Банк, ex-Tinkoff Kassa) internet acquiring.
export type PaymentProvider = 'manual' | 'tbank'

export type DeliveryMethod = 'cdek_pvz' | 'cdek_courier'

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
  address: string
  comment: string | null
}

// One entry per status transition — appended by the checkout flow, the
// payment webhook, the reconciliation job, and manual admin actions.
export interface OrderStatusHistoryEntry {
  from: OrderStatus | null
  to: OrderStatus
  at: string
  by: 'tbank' | 'admin' | 'reconcile'
  comment?: string
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
  paymentUrl: string | null
  statusHistory: OrderStatusHistoryEntry[]
  items: OrderItem[]
  createdAt: string
  paidAt: string | null
  erpSyncedAt: string | null
}

// --- checkout API contract ---

export interface CheckoutRequest {
  items: Array<{ productId: string; quantity: number }>
  customer: { name: string; phone: string; email?: string }
  delivery: { method: DeliveryMethod; address: string; comment?: string }
}

export interface CheckoutResponse {
  orderNumber: string
  paymentUrl: string | null
}

// Public status endpoint payload — deliberately PII-free.
export interface PublicOrderStatus {
  orderNumber: string
  status: OrderStatus
  totalRub: number
  createdAt: string
  paidAt: string | null
}
