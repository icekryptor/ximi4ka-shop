// Адреса скачивания материалов для ссылок в браузере (как PUBLIC_API_BASE в
// lib/api.ts и API_BASE в lib/accountApi.ts: NEXT_PUBLIC_API_URL).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

/** Скачивание со страницы заказа: доступ по секрету заказа (?t=). */
export function orderMaterialDownloadUrl(
  orderNumber: string,
  materialId: string,
  token: string,
): string {
  return `${API_BASE}/api/public/orders/${encodeURIComponent(orderNumber)}/materials/${encodeURIComponent(materialId)}/download?t=${encodeURIComponent(token)}`
}

/** Скачивание из кабинета: доступ по cookie сессии покупателя. */
export function accountMaterialDownloadUrl(materialId: string): string {
  return `${API_BASE}/api/account/materials/${encodeURIComponent(materialId)}/download`
}
