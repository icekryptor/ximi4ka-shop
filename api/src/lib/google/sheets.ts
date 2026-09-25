import { createSign } from 'node:crypto'
import { SHEET_HEADER } from '../notifications/format.js'
import { RateLimitError } from '../notifications/rateLimit.js'

// Google Sheets API v4 от имени сервисного аккаунта. JWT подписываем сами
// (RS256, node:crypto) — ради одного токена тянуть googleapis незачем.
// Строка заказа ищется по номеру в столбце A и перезаписывается целиком:
// номер строки не храним, менеджер может сортировать таблицу.

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'
const LAST_COLUMN = 'L' // 12 колонок SHEET_HEADER
const TOKEN_MARGIN_MS = 60_000
// Не дожидаемся зависшего соединения вечно — таймаут бросает исключение
// (не SheetsConfigError), обработчик очереди спланирует повтор.
const REQUEST_TIMEOUT_MS = 20_000
// Пауза после 429, если Google не прислал Retry-After.
const DEFAULT_RETRY_AFTER_MS = 60_000

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

// Ошибка настройки (нет доступа, нет листа, битый ключ) — повторять бессмысленно.
export class SheetsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetsConfigError'
  }
}

// JSON ключа кладут в env по-разному: как есть, в base64, с буквальными \n
// в private_key. Принимаем все три.
export function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim()
  const text = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8')
  let data: Partial<ServiceAccount>
  try {
    data = JSON.parse(text) as Partial<ServiceAccount>
  } catch {
    throw new SheetsConfigError('GOOGLE_SERVICE_ACCOUNT_JSON: не JSON и не base64 от JSON')
  }
  if (!data.client_email || !data.private_key) {
    throw new SheetsConfigError('GOOGLE_SERVICE_ACCOUNT_JSON: нет client_email или private_key')
  }
  return {
    client_email: data.client_email,
    private_key: data.private_key.replace(/\\n/g, '\n'),
    token_uri: data.token_uri,
  }
}

// Retry-After в секундах; дату (вторая форма заголовка) и мусор не разбираем —
// берём паузу по умолчанию.
function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export class GoogleSheetsClient {
  private readonly account: ServiceAccount
  private readonly spreadsheetId: string
  private readonly sheetName: string
  private readonly fetchImpl: Fetch
  private readonly now: () => number
  private token: { value: string; expiresAt: number } | null = null

  constructor(opts: {
    serviceAccount: ServiceAccount
    spreadsheetId: string
    sheetName: string
    fetch?: Fetch
    now?: () => number
  }) {
    this.account = opts.serviceAccount
    this.spreadsheetId = opts.spreadsheetId
    this.sheetName = opts.sheetName
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.now = opts.now ?? Date.now
  }

  // null — канал не настроен. Битый JSON ключа — SheetsConfigError: пусть
  // это увидит тот, кто собирает каналы (worker.channelsFromEnv).
  static fromEnv(env: NodeJS.ProcessEnv = process.env): GoogleSheetsClient | null {
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON
    const spreadsheetId = env.GOOGLE_SHEETS_ID
    if (!raw || !spreadsheetId) return null
    return new GoogleSheetsClient({
      serviceAccount: parseServiceAccount(raw),
      spreadsheetId,
      sheetName: env.GOOGLE_SHEETS_TAB || 'Заказы',
    })
  }

  async upsertOrderRow(orderNumber: string, row: (string | number)[]): Promise<void> {
    const column = await this.request<{ values?: string[][] }>(
      'GET',
      this.valuesPath(this.range('A:A')),
    )
    const values = column.values ?? []
    if (values.length === 0) {
      await this.request(
        'PUT',
        `${this.valuesPath(this.range(`A1:${LAST_COLUMN}1`))}?valueInputOption=RAW`,
        {
          values: [SHEET_HEADER],
        },
      )
    }
    // Первая строка — заголовки; ищем со второй, первое совпадение.
    const index = values.findIndex((cells, i) => i > 0 && cells?.[0] === orderNumber)
    if (index > 0) {
      const r = index + 1
      await this.request(
        'PUT',
        `${this.valuesPath(this.range(`A${r}:${LAST_COLUMN}${r}`))}?valueInputOption=RAW`,
        { values: [row] },
      )
      return
    }
    await this.request(
      'POST',
      `${this.valuesPath(this.range(`A:${LAST_COLUMN}`))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [row] },
    )
  }

  private range(cells: string): string {
    return `'${this.sheetName.replace(/'/g, "''")}'!${cells}`
  }

  private valuesPath(range: string): string {
    return `${API}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > this.now()) return this.token.value
    const tokenUri = this.account.token_uri ?? DEFAULT_TOKEN_URI
    const iat = Math.floor(this.now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = base64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: SHEETS_SCOPE,
        aud: tokenUri,
        iat,
        exp: iat + 3600,
      }),
    )
    let signature: string
    try {
      signature = createSign('RSA-SHA256')
        .update(`${header}.${claims}`)
        .sign(this.account.private_key, 'base64url')
    } catch {
      throw new SheetsConfigError(
        'Не удалось подписать токен: проверьте private_key сервисного аккаунта',
      )
    }
    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }).toString(),
    })
    const data = (await res.json().catch(() => null)) as {
      access_token?: string
      expires_in?: number
      error_description?: string
    } | null
    if (!res.ok || !data?.access_token) {
      const reason = data?.error_description ?? `код ${res.status}`
      if (res.status === 429)
        throw new RateLimitError(`Google не выдал токен: ${reason}`, retryAfterMs(res))
      if (res.status >= 400 && res.status < 500)
        throw new SheetsConfigError(`Google не выдал токен: ${reason}`)
      throw new Error(`Google не выдал токен: ${reason}`)
    }
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + (data.expires_in ?? 3600) * 1000,
    }
    return data.access_token
  }

  private async request<T = unknown>(
    method: 'GET' | 'PUT' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.accessToken()
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null
    if (!res.ok) {
      const message = `Google Sheets ${res.status}: ${data?.error?.message ?? 'без описания'}`
      if (res.status === 429) throw new RateLimitError(message, retryAfterMs(res))
      // 400 — чаще всего нет такого листа, 403 — нет доступа, 404 — нет таблицы.
      if (res.status === 400 || res.status === 403 || res.status === 404)
        throw new SheetsConfigError(message)
      throw new Error(message)
    }
    return (data ?? {}) as T
  }
}
