import type { PaymentProvider as PaymentProviderName } from '@ximi4ka-shop/shared'
import type { Order } from '../../entities/Order.js'

// Order-status-domain view of a payment: providers map their own status
// vocabularies (e.g. Т-Касса AUTHORIZED/CONFIRMED/REJECTED/...) onto this.
export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface PaymentEvent {
  // Provider-side payment id (Т-Касса PaymentId). Matched against
  // orders.payment_intent_id.
  externalId: string
  // Our order number (we pass it as the provider-side OrderId).
  orderNumber: string | null
  status: PaymentStatus
  raw: Record<string, unknown>
}

export interface CreatePaymentResult {
  externalId: string
  paymentUrl: string
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  // null → no online payment created; the order stays pending and a manager
  // follows up (ManualProvider always, TBankProvider on Init failure).
  createPayment(order: Order): Promise<CreatePaymentResult | null>
  // null → body is not a valid signed notification for this provider.
  verifyAndParseWebhook(body: unknown): PaymentEvent | null
  getStatus(externalId: string): Promise<PaymentStatus | 'unknown'>
}
