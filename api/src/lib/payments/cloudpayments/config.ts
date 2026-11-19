import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { MAX_PAYMENT_SURCHARGE_PERCENT } from '@ximi4ka-shop/shared/types/payment'
import { getSettings } from '../../settings.js'

// CloudPayments: ключи — в env (CLOUDPAYMENTS_PUBLIC_ID — логин, CLOUDPAYMENTS_API_SECRET —
// пароль Basic-авторизации и ключ HMAC вебхуков), рубильник, режим и процент надбавки —
// в админке. Вебхук и сверка работают, пока заданы ключи, независимо от рубильника:
// оплату по уже выданной ссылке нужно засчитать и после выключения.

export type CloudPaymentsMode = 'test' | 'live'

export const CLOUDPAYMENTS_API_URL = 'https://api.cloudpayments.ru'

export interface CloudPaymentsConfig {
  publicId: string
  apiSecret: string
  mode: CloudPaymentsMode
  enabled: boolean
  surchargePercent: number
}

interface CloudPaymentsSettings {
  cloudpaymentsEnabled: boolean
  cloudpaymentsMode: string
  cloudpaymentsSurchargePercent: number
}

export function hasCloudPaymentsKeys(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    (env.CLOUDPAYMENTS_PUBLIC_ID ?? '').trim().length > 0 &&
    (env.CLOUDPAYMENTS_API_SECRET ?? '').trim().length > 0
  )
}

export function cloudPaymentsConfigFrom(
  settings: CloudPaymentsSettings,
  env: NodeJS.ProcessEnv = process.env,
): CloudPaymentsConfig | null {
  if (!hasCloudPaymentsKeys(env)) return null
  const percent = settings.cloudpaymentsSurchargePercent
  return {
    publicId: (env.CLOUDPAYMENTS_PUBLIC_ID ?? '').trim(),
    apiSecret: (env.CLOUDPAYMENTS_API_SECRET ?? '').trim(),
    mode: settings.cloudpaymentsMode === 'live' ? 'live' : 'test',
    enabled: settings.cloudpaymentsEnabled,
    surchargePercent:
      Number.isInteger(percent) && percent > 0
        ? Math.min(percent, MAX_PAYMENT_SURCHARGE_PERCENT)
        : 0,
  }
}

export async function getCloudPaymentsConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CloudPaymentsConfig | null> {
  return cloudPaymentsConfigFrom(await getSettings(), env)
}

// Платежи тестового терминала (TestMode=1) засчитываются вне production, а на
// production — только в режиме «Тест»: тогда в env лежат ключи тестового терминала, а
// заказ CloudPayments в этом режиме может создать только вошедший админ (см. чекаут).
// В режиме «Боевой» и без конфигурации тестовые уведомления на проде отклоняются.
export function acceptsTestPayments(
  cfg: Pick<CloudPaymentsConfig, 'mode'> | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== 'production' || cfg?.mode === 'test'
}

// Доступен на чекауте: рубильник включён; боевой режим — всем; тестовый вне production —
// всем, на production — только вошедшему админу (сквозная проверка тестовым
// терминалом), чтобы покупатели на проде никогда не попали на тестовый терминал.
export function isCloudPaymentsCheckoutAvailable(
  cfg: CloudPaymentsConfig | null,
  env: NodeJS.ProcessEnv = process.env,
  opts: { admin?: boolean } = {},
): cfg is CloudPaymentsConfig {
  if (!cfg || !cfg.enabled) return false
  if (cfg.mode === 'live') return true
  return env.NODE_ENV !== 'production' || opts.admin === true
}

// Для GET /api/public/settings: null — недоступен; наружу — только процент надбавки.
// Без админ-признака: ответ кешируется (public, max-age=60), поэтому на production в
// режиме «Тест» здесь всегда null — админ видит способ через checkout-preview.
export function publicCloudPayments(
  cfg: CloudPaymentsConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): PublicCloudPayments | null {
  return isCloudPaymentsCheckoutAvailable(cfg, env)
    ? { surchargePercent: cfg.surchargePercent }
    : null
}
