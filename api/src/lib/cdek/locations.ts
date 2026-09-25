import type { CdekCity, CdekCityPoints, CdekPoint } from '@ximi4ka-shop/shared'
import { CdekError, type CdekClient } from './client.js'

// Подсказки городов и пункты выдачи для чекаута (спека
// docs/superpowers/specs/2026-09-25-cdek-pvz-list-design.md, §4). Кеш — в
// памяти процесса, как у rateLimit: api — один контейнер. Кеш бережёт
// договорной ключ СДЭК, а чекаут проверяет по нему пункт без лишнего похода
// в СДЭК.

type Cdek = Pick<CdekClient, 'get'>

export const CITIES_TTL_MS = 60 * 60_000
export const POINTS_TTL_MS = 6 * 60 * 60_000
// Пустой список — скорее сбой СДЭК, чем город без ПВЗ: держим его недолго,
// чтобы не выключить пункты в городе на шесть часов, но и не ходить в СДЭК
// на каждый запрос.
export const EMPTY_POINTS_TTL_MS = 5 * 60_000
export const CITY_SUGGEST_LIMIT = 10
// Ключ кеша подсказок — то, что набрал покупатель: без предела карта росла бы
// от случайных строк.
const MAX_CACHE_ENTRIES = 2000

export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = MAX_CACHE_ENTRIES,
    // Date.now ищем при каждом вызове, а не запоминаем ссылку: так его
    // подменяют фейковые таймеры.
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return hit.value
  }

  // ttlMs — свой срок для этой записи (по умолчанию — срок кеша).
  set(key: string, value: T, ttlMs = this.ttlMs): void {
    this.entries.delete(key)
    // Map помнит порядок вставки: первый ключ — самый старый.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}

const citiesCache = new TtlCache<CdekCity[]>(CITIES_TTL_MS)
const pointsCache = new TtlCache<CdekCityPoints>(POINTS_TTL_MS)

// Для тестов: кеш модульный и иначе переживал бы соседние тесты.
export function clearCdekLocationCache(): void {
  citiesCache.clear()
  pointsCache.clear()
}

function badResponse(what: string): CdekError {
  return new CdekError(502, 'bad_response', `СДЭК вернул не список: ${what}`)
}

// Для логов — только статус и код. Текст сетевой ошибки содержит адрес
// запроса, а в нём то, что набрал покупатель.
export function describeCdekError(err: unknown): string {
  if (err instanceof CdekError) return `${err.status} ${err.code}`
  return err instanceof Error ? err.name : 'unknown'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toCity(raw: unknown): CdekCity | null {
  const r = raw as { code?: unknown; full_name?: unknown } | null
  if (!r || !isNumber(r.code) || typeof r.full_name !== 'string') return null
  const fullName = r.full_name.trim()
  const name = fullName.split(',')[0]!.trim()
  return name === '' ? null : { code: r.code, name, fullName }
}

function toPoint(raw: unknown): CdekPoint | null {
  const r = raw as {
    code?: unknown
    name?: unknown
    work_time?: unknown
    location?: { address?: unknown; longitude?: unknown; latitude?: unknown } | null
  } | null
  const loc = r?.location
  if (!r || typeof r.code !== 'string' || !loc) return null
  if (!isNumber(loc.longitude) || !isNumber(loc.latitude)) return null
  return {
    code: r.code,
    name: typeof r.name === 'string' ? r.name : r.code,
    address: typeof loc.address === 'string' ? loc.address : '',
    location: [loc.longitude, loc.latitude],
    workTime: typeof r.work_time === 'string' ? r.work_time : '',
  }
}

// По коду: порядок стабилен для поиска и тестов и не зависит от локали.
function byCode(a: CdekPoint, b: CdekPoint): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
}

// GET /v2/location/suggest/cities. q уже обрезан и проверен роутом.
export async function suggestCities(cdek: Cdek, q: string): Promise<CdekCity[]> {
  const key = q.toLowerCase()
  const cached = citiesCache.get(key)
  if (cached) return cached
  const raw = await cdek.get<unknown>('/location/suggest/cities', { name: q, country_code: 'RU' })
  if (!Array.isArray(raw)) throw badResponse('города')
  const cities = raw
    .map(toCity)
    .filter((c): c is CdekCity => c !== null)
    .slice(0, CITY_SUGGEST_LIMIT)
  citiesCache.set(key, cities)
  return cities
}

// Пункты выдачи города — только ПВЗ с выдачей (§3) — и центр города для
// карты. Пустой список живёт в кеше 5 минут, а не 6 часов: если СДЭК однажды
// ответит пустотой по ошибке, ПВЗ в городе быстро вернутся.
export async function getCityPoints(cdek: Cdek, cityCode: number): Promise<CdekCityPoints> {
  const key = String(cityCode)
  const cached = pointsCache.get(key)
  if (cached) return cached
  const [rawPoints, rawCities] = await Promise.all([
    cdek.get<unknown>('/deliverypoints', { city_code: cityCode, type: 'PVZ', is_handout: true }),
    cdek.get<unknown>('/location/cities', { code: cityCode }),
  ])
  if (!Array.isArray(rawPoints)) throw badResponse('пункты')
  if (!Array.isArray(rawCities)) throw badResponse('город')
  const found = rawCities[0] as
    | { city?: unknown; longitude?: unknown; latitude?: unknown }
    | undefined
  const result: CdekCityPoints = {
    city: {
      code: cityCode,
      name: typeof found?.city === 'string' ? found.city : '',
      location:
        found && isNumber(found.longitude) && isNumber(found.latitude)
          ? [found.longitude, found.latitude]
          : null,
    },
    points: rawPoints
      .map(toPoint)
      .filter((p): p is CdekPoint => p !== null)
      .sort(byCode),
  }
  pointsCache.set(key, result, result.points.length > 0 ? POINTS_TTL_MS : EMPTY_POINTS_TTL_MS)
  return result
}
