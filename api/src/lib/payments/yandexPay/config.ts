import type { PublicYandexPay } from '@ximi4ka-shop/shared'
import { getSettings } from '../../settings.js'

// Яндекс Пэй: ключи — в env (YANDEX_PAY_MERCHANT_ID, YANDEX_PAY_API_KEY), рубильник
// и режим — в админке (SiteSettings.yandexPayEnabled, yandexPayMode). Вебхук и сверка
// работают, пока задан Merchant ID, независимо от рубильника; на чекауте Яндекс —
// только по правилу isCheckoutAvailable.

export type YandexPayMode = 'sandbox' | 'production'

export const YANDEX_PAY_HOSTS: Record<YandexPayMode, string> = {
  production: 'https://pay.yandex.ru',
  sandbox: 'https://sandbox.pay.yandex.ru',
}

export interface YandexPayConfig {
  merchantId: string
  apiKey: string
  /** Ключ для Authorization: Api-Key — в песочнице им служит Merchant ID. */
  authKey: string
  mode: YandexPayMode
  enabled: boolean
  baseUrl: string
  /** JWKS для проверки вебхука; адрес только отсюда, никогда из запроса. */
  jwksUrl: string
}

interface YandexSettings {
  yandexPayEnabled: boolean
  yandexPayMode: string
}

export function hasYandexPayMerchant(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.YANDEX_PAY_MERCHANT_ID ?? '').trim().length > 0
}

export function yandexPayConfigFrom(
  settings: YandexSettings,
  env: NodeJS.ProcessEnv = process.env,
): YandexPayConfig | null {
  const merchantId = (env.YANDEX_PAY_MERCHANT_ID ?? '').trim()
  if (!merchantId) return null
  const apiKey = (env.YANDEX_PAY_API_KEY ?? '').trim()
  const mode: YandexPayMode = settings.yandexPayMode === 'production' ? 'production' : 'sandbox'
  const baseUrl = YANDEX_PAY_HOSTS[mode]
  return {
    merchantId,
    apiKey,
    authKey: mode === 'production' ? apiKey : merchantId,
    mode,
    enabled: settings.yandexPayEnabled,
    baseUrl,
    jwksUrl: `${baseUrl}/api/jwks`,
  }
}

export async function getYandexPayConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<YandexPayConfig | null> {
  return yandexPayConfigFrom(await getSettings(), env)
}

// Доступен на чекауте: рубильник включён и в боевом режиме есть ключ API, а песочница —
// только вне NODE_ENV=production, чтобы она никогда не попала к покупателям на проде.
export function isCheckoutAvailable(
  cfg: YandexPayConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): cfg is YandexPayConfig {
  if (!cfg || !cfg.enabled) return false
  if (cfg.mode === 'production') return cfg.apiKey.length > 0
  return env.NODE_ENV !== 'production'
}

export async function isYandexPayAvailable(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return isCheckoutAvailable(await getYandexPayConfig(env), env)
}

// Для GET /api/public/settings: null — недоступен; Merchant ID — только в боевом режиме
// (в песочнице он равен ключу API; без него витрина плашек не рисует).
export function publicYandexPay(
  cfg: YandexPayConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): PublicYandexPay | null {
  if (!isCheckoutAvailable(cfg, env)) return null
  return cfg.mode === 'production' ? { split: true, merchantId: cfg.merchantId } : { split: true }
}
