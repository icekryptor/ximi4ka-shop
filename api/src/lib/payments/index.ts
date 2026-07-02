import type { PaymentProvider as PaymentProviderName } from '@ximi4ka-shop/shared'
import { ManualProvider } from './manual.js'
import { TBankProvider } from './tbank.js'
import type { PaymentProvider } from './types.js'

export type {
  PaymentProvider,
  PaymentEvent,
  PaymentStatus,
  CreatePaymentResult,
} from './types.js'
export { ManualProvider } from './manual.js'
export { TBankProvider, mapTbankStatus, TBANK_DEFAULT_API_URL } from './tbank.js'
export { generateToken, verifyToken, buildTokenString } from './token.js'

// PAYMENT_PROVIDER=manual|tbank, default manual. Resolved per call (not
// cached) so a test — or a config reload — can flip the env without a
// process restart.
export function resolvePaymentProviderName(): PaymentProviderName {
  const raw = (process.env.PAYMENT_PROVIDER ?? 'manual').trim().toLowerCase()
  if (raw === 'tbank') return 'tbank'
  if (raw !== 'manual' && raw !== '') {
    console.error(`payments: unknown PAYMENT_PROVIDER "${raw}" — falling back to manual`)
  }
  return 'manual'
}

export function getPaymentProvider(): PaymentProvider {
  return resolvePaymentProviderName() === 'tbank'
    ? new TBankProvider()
    : new ManualProvider()
}
