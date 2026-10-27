const SOURCE_LABELS: Record<string, string> = {
  organic: 'Поиск',
  direct: 'Прямые заходы',
  referral: 'Ссылки на сайтах',
  ad: 'Реклама',
  social: 'Соцсети',
  internal: 'Внутренние переходы',
  recommend: 'Рекомендательные системы',
  messenger: 'Мессенджеры',
  email: 'Почта',
  saved: 'Сохранённые страницы',
  qrcode: 'QR-коды',
  undefined: 'Не определено',
}

const ENGINE_LABELS: Record<string, string> = {
  yandex: 'Яндекс',
  google: 'Google',
  undefined: 'Не определено',
}

export const sourceLabel = (code: string) => SOURCE_LABELS[code] ?? code
export const engineLabel = (code: string) => ENGINE_LABELS[code] ?? code

export function formatCount(n: number): string {
  return n.toLocaleString('ru-RU')
}

export function formatDelta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? 'новое' : '—'
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct > 0) return `+${pct}%`
  if (pct < 0) return `−${Math.abs(pct)}%`
  return '0%'
}
