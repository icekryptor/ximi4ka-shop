import { RateLimitError } from '../notifications/rateLimit.js'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ConversionRow {
  yclid: string
  /** Идентификатор цели в Метрике (создаётся заранее: «JavaScript-событие»). */
  target: string
  /** Время оплаты. Метрика принимает только прошлое. */
  eventAt: Date
  priceRub: number
}

export interface UploadResult {
  uploadId: number
  sourceQuantity: number
  lineQuantity: number
  status: string
}

export class MetrikaError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'MetrikaError'
    this.status = status
  }
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

// CSV для offline_conversions/upload: колонки Yclid, Target, DateTime (Unix в
// секундах), Price, Currency; разделитель строк CRLF (RFC 4180), UTF-8.
export function buildCsv(rows: ConversionRow[]): string {
  const lines = rows.map((r) =>
    [
      csvCell(r.yclid),
      csvCell(r.target),
      String(Math.floor(r.eventAt.getTime() / 1000)),
      String(r.priceRub),
      'RUB',
    ].join(','),
  )
  return ['Yclid,Target,DateTime,Price,Currency', ...lines].join('\r\n') + '\r\n'
}

// Retry-After бывает числом секунд или датой; по умолчанию и при мусоре — минута.
function retryAfterMs(header: string | null): number {
  const seconds = Number(header)
  if (header && Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const date = header ? Date.parse(header) : NaN
  return Number.isFinite(date) && date > Date.now() ? date - Date.now() : 60_000
}

const API_BASE = 'https://api-metrika.yandex.net/management/v1/counter'

// Загрузка офлайн-конверсий в Яндекс.Метрику. Документация:
// https://yandex.ru/dev/metrika/ru/management/offline-conv
export class MetrikaClient {
  private readonly token: string
  private readonly fetchImpl: Fetch
  private readonly timeoutMs: number

  constructor(opts: { token: string; fetch?: Fetch; timeoutMs?: number }) {
    this.token = opts.token
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = opts.timeoutMs ?? 30_000
  }

  // null, если токена нет: загрузка конверсий тогда не запускается.
  static fromEnv(env: NodeJS.ProcessEnv = process.env): MetrikaClient | null {
    const token = env.METRIKA_OAUTH_TOKEN?.trim()
    return token ? new MetrikaClient({ token }) : null
  }

  async uploadConversions(counterId: string, rows: ConversionRow[]): Promise<UploadResult> {
    const form = new FormData()
    form.append('file', new Blob([buildCsv(rows)], { type: 'text/csv' }), 'conversions.csv')

    const res = await this.fetchImpl(`${API_BASE}/${counterId}/offline_conversions/upload`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${this.token}` },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (res.status === 429) {
      await res.body?.cancel()
      throw new RateLimitError('Metrika 429', retryAfterMs(res.headers.get('retry-after')))
    }
    const text = await res.text()
    if (!res.ok) {
      throw new MetrikaError(res.status, `Metrika ${res.status}: ${text.slice(0, 300)}`)
    }

    let uploading: Record<string, unknown> | undefined
    try {
      uploading = (JSON.parse(text) as { uploading?: Record<string, unknown> }).uploading
    } catch {
      uploading = undefined
    }
    if (!uploading || typeof uploading.id !== 'number') {
      throw new MetrikaError(res.status, 'Metrika: в ответе нет данных о загрузке (uploading)')
    }
    return {
      uploadId: uploading.id,
      sourceQuantity: Number(uploading.source_quantity ?? 0),
      lineQuantity: Number(uploading.line_quantity ?? 0),
      status: String(uploading.status ?? ''),
    }
  }
}
