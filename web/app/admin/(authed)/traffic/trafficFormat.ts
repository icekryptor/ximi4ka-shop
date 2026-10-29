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

// 2026-10-19 → «19.10»
const ddmm = (iso: string) => iso.slice(5).split('-').reverse().join('.')
// 2026-10-19 → «19.10.2026»
export const formatDay = (iso: string) => iso.split('-').reverse().join('.')

// Подпись под показателем: разница и с каким периодом сравнивали.
export function comparedPeriodText(
  cur: number,
  prev: number,
  { prevFrom, prevTo }: { prevFrom: string; prevTo: string },
): string {
  const range = `${ddmm(prevFrom)}–${ddmm(prevTo)}`
  if (prev === 0) return cur > 0 ? `в прошлом периоде (${range}) данных нет` : '—'
  return `${formatDelta(cur, prev)} к ${range}`
}
