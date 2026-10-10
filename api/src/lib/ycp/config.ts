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
