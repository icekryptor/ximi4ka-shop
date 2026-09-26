// Тонкий клиент API СДЭК v2 (apidoc.cdek.ru). Шесть методов, которые нам
// нужны, проще держать своими, чем тянуть стороннюю библиотеку одного автора.
//
// Токен — OAuth client_credentials, живёт ~час, refresh нет: берём новый за
// минуту до истечения. Параллельные запросы ждут один и тот же запрос токена.

// Общая тестовая учётка — опубликована в документации СДЭК для всех
// разработчиков, заказы по ней не обрабатываются. Секретом не является.
export const PUBLIC_TEST_CREDENTIALS = {
  clientId: 'wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP',
  clientSecret: 'RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5',
}

export const TEST_BASE_URL = 'https://api.edu.cdek.ru/v2'
export const PROD_BASE_URL = 'https://api.cdek.ru/v2'
const TOKEN_REFRESH_MARGIN_MS = 60_000

export class CdekError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'CdekError'
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
type Query = Record<string, string | number | boolean | undefined | null>

export interface CdekClientOptions {
  baseUrl: string
  clientId: string
  clientSecret: string
  fetch?: Fetch
  now?: () => number
  timeoutMs?: number
}

export class CdekClient {
  readonly baseUrl: string
  readonly clientId: string
  private readonly clientSecret: string
  private readonly fetchImpl: Fetch
  private readonly now: () => number
  private readonly timeoutMs: number
  private token: { value: string; expiresAt: number } | null = null
  private pendingToken: Promise<string> | null = null

  constructor(opts: CdekClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.clientId = opts.clientId
    this.clientSecret = opts.clientSecret
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.now = opts.now ?? Date.now
    this.timeoutMs = opts.timeoutMs ?? 10_000
  }

  // Без ключей — тестовая среда с общей учёткой (разработка, CI). С ключами —
  // боевая, если CDEK_API_URL не переопределён. Боевая без ключей — ошибка
  // конфигурации, а не повод тихо уйти в песочницу.
  static fromEnv(env: NodeJS.ProcessEnv = process.env): CdekClient {
    const clientId = env.CDEK_CLIENT_ID
    const clientSecret = env.CDEK_CLIENT_SECRET
    const baseUrl = env.CDEK_API_URL ?? (clientId ? PROD_BASE_URL : TEST_BASE_URL)
    if (!clientId || !clientSecret) {
      if (baseUrl.replace(/\/$/, '') !== TEST_BASE_URL) {
        throw new Error('CDEK_CLIENT_ID и CDEK_CLIENT_SECRET обязательны для боевой среды СДЭК')
      }
      return new CdekClient({ baseUrl, ...PUBLIC_TEST_CREDENTIALS })
    }
    return new CdekClient({ baseUrl, clientId, clientSecret })
  }

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query })
  }

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body })
  }

  // Сырой ответ — для прокси виджета: ему нужны статус, тело как есть и
  // заголовки X-* (виджет листает ПВЗ по X-Total-Elements).
  async raw(
    method: 'GET' | 'POST',
    path: string,
    { query, body }: { query?: Query; body?: unknown } = {},
  ): Promise<{ status: number; headers: Record<string, string>; text: string }> {
    const token = await this.getToken()
    const url = this.buildUrl(path, query)
    const res = await this.fetchWithTimeout(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-')) headers[key] = value
    })
    return { status: res.status, headers, text: await res.text() }
  }

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    return url.toString()
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return this.token.value
    }
    this.pendingToken ??= this.fetchToken().finally(() => {
      this.pendingToken = null
    })
    return this.pendingToken
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    const res = await this.fetchWithTimeout(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = (await res.json().catch(() => null)) as {
      access_token?: string
      expires_in?: number
    } | null
    if (!res.ok || !data?.access_token) {
      throw new CdekError(res.status, 'auth_failed', 'СДЭК не выдал токен — проверьте ключи')
    }
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + (data.expires_in ?? 3599) * 1000,
    }
    return data.access_token
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    { query, body }: { query?: Query; body?: unknown },
  ): Promise<T> {
    const token = await this.getToken()
    const url = this.buildUrl(path, query)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    type CdekErrorItem = { code?: string; message?: string }
    const data = (await res.json().catch(() => null)) as
      | (T & { errors?: CdekErrorItem[]; requests?: { errors?: CdekErrorItem[] }[] })
      | null
    if (!res.ok) {
      // Калькулятор и ПВЗ кладут ошибки в корень, заказы — в requests[].errors.
      const errors = data?.errors ?? data?.requests?.flatMap((r) => r.errors ?? []) ?? []
      const first = errors[0]
      throw new CdekError(
        res.status,
        first?.code ?? 'http_error',
        first?.message ?? `СДЭК ответил ${res.status}`,
        errors,
      )
    }
    return data as T
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (err) {
      throw new CdekError(0, 'network_error', `СДЭК недоступен: ${(err as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
  }
}
