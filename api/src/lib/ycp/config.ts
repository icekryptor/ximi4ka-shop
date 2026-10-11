// Настройки интеграции с Yandex Commerce Protocol (спека
// docs/superpowers/specs/2026-10-11-ycp-integration-design.md). Читаются из
// окружения на каждый вызов: тест или перезапуск с новым app.env меняют их
// без пересборки.

// Токен короче 32 символов считается незаданным — как секреты SSO в app.env.
export const YCP_TOKEN_MIN_LENGTH = 32

export function ycpTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.YCP_API_TOKEN?.trim() ?? ''
  return token.length >= YCP_TOKEN_MIN_LENGTH ? token : null
}

export interface YcpWarehouse {
  id: string
  title: string
  address: string
  phone: string
}

// Склад один — магазин отгружает из Москвы. Пустое любое поле — склада нет:
// методы, которым он нужен, отвечают 500 (Яндекс повторит позже).
export function ycpWarehouseFromEnv(env: NodeJS.ProcessEnv = process.env): YcpWarehouse | null {
  const id = env.YCP_WAREHOUSE_ID?.trim()
  const title = env.YCP_WAREHOUSE_TITLE?.trim()
  const address = env.YCP_WAREHOUSE_ADDRESS?.trim()
  const phone = env.YCP_WAREHOUSE_PHONE?.trim()
  if (!id || !title || !address || !phone) return null
  return { id, title, address, phone }
}

// Остаток — константа (спека YCP, «Остатки»): реального учёта и резерва нет.
export const YCP_IN_STOCK_QUANTITY = 99

// Адрес витрины для ссылок на товар и картинки в ответах Яндексу.
export function ycpSiteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.WEB_ORIGIN?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
}

// Общий срок на вызовы СДЭК в /checkout/delivery/options: ответ Яндексу — до
// 5 секунд, запас на базу и сеть. Больше 4000 не принимаем.
export const YCP_CDEK_TIMEOUT_MS_DEFAULT = 3500

export function ycpCdekTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.YCP_CDEK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 && n <= 4000 ? n : YCP_CDEK_TIMEOUT_MS_DEFAULT
}
