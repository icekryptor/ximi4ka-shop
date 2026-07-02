import type { Order } from '../../entities/Order.js'
import type {
  CreatePaymentResult,
  PaymentEvent,
  PaymentProvider,
  PaymentStatus,
} from './types.js'

// Manual mode: no online payment at all. The order is created as `pending`
// with paymentUrl = null and a manager contacts the customer to arrange
// payment. Used while acquiring credentials (Т-Касса) are not issued yet —
// switching to online payments is a single PAYMENT_PROVIDER=tbank env change.
export class ManualProvider implements PaymentProvider {
  readonly name = 'manual' as const

  async createPayment(_order: Order): Promise<CreatePaymentResult | null> {
    return null
  }

  verifyAndParseWebhook(_body: unknown): PaymentEvent | null {
    return null
  }

  async getStatus(_externalId: string): Promise<PaymentStatus | 'unknown'> {
    return 'unknown'
  }
}
