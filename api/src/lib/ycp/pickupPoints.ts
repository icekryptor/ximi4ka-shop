import { AppDataSource } from '../../config/dataSource.js'
import type { CdekClient } from '../cdek/client.js'
import { getCdekClient } from '../cdek/index.js'
import { describeCdekError } from '../cdek/locations.js'
import { ycpTokenFromEnv } from './config.js'

// Пункты выдачи СДЭК по всей России для GET /checkout/delivery/pickup_points
// (спека YCP). Список большой — тысячи ПВЗ, — поэтому запрос его не строит:
// фоновая задача забирает СДЭК постранично и кладёт в память и в таблицу
// ycp_pickup_points_snapshot (переживает перезапуск api), а метод только режет
// готовый массив. Объём: ~450 байт JSON на пункт, единицы мегабайт на всю
// Россию; срез на 1000 пунктов — миллисекунды, далеко от предела в 5 секунд.

type CdekGet = Pick<CdekClient, 'get'>

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type YcpWorkingHours = Partial<Record<(typeof DAY_KEYS)[number], string>>

export interface YcpPickupPoint {
  id: string
  name: string
  address: string
  has_fitting?: boolean
  is_cash_available: boolean
  is_card_available: boolean
  working_hours: YcpWorkingHours
  coordinates: { lat: number; lon: number }
  time_zone: number
  display_service_type: 'cdek'
}

// cityCode — для расчёта доставки до пункта: калькулятор СДЭК ждёт код города.
export interface PickupPointEntry {
  point: YcpPickupPoint
  cityCode: number
}

export const CDEK_PAGE_SIZE = 1000
// Предохранитель от бесконечного цикла, если СДЭК перестанет укорачивать страницы.
export const CDEK_MAX_PAGES = 100
export const PICKUP_POINTS_REFRESH_MS = 12 * 60 * 60_000

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// work_time_list СДЭК: [{ day: 1..7, time: "10:00/20:00" }] → { mon: "10:00-20:00" }.
// Выходной день Яндекс просит не передавать — его просто нет в объекте.
export function workingHoursFrom(list: unknown): YcpWorkingHours {
  const hours: YcpWorkingHours = {}
  if (!Array.isArray(list)) return hours
  for (const item of list) {
    const r = item as { day?: unknown; time?: unknown } | null
    if (!r || !isNumber(r.day) || r.day < 1 || r.day > 7) continue
    const m = /^(\d{2}:\d{2})\s*[/-]\s*(\d{2}:\d{2})$/.exec(text(r.time))
    if (m) hours[DAY_KEYS[r.day - 1]] = `${m[1]}-${m[2]}`
  }
  return hours
}

// Часовой пояс СДЭК в списке пунктов не отдаёт. Приближение по долготе:
// российское время опережает солнечное примерно на час, ceil(lon/15) даёт
// Москве +3, Калининграду +2, Екатеринбургу +5, Красноярску +7; в части
// Сибири и Дальнего Востока ошибка — час. Время работы пункта — местное, пояс
// влияет только на пересчёт у Яндекса.
export function approxTimeZone(longitude: number): number {
  const lon = longitude < 0 ? longitude + 360 : longitude
  return Math.min(12, Math.max(2, Math.ceil(lon / 15)))
}

export function toPickupPointEntry(raw: unknown): PickupPointEntry | null {
  const r = raw as {
    code?: unknown
    name?: unknown
    have_cash?: unknown
    have_cashless?: unknown
    is_dressing_room?: unknown
    work_time_list?: unknown
    location?: {
      city_code?: unknown
      longitude?: unknown
      latitude?: unknown
      address?: unknown
      address_full?: unknown
    } | null
  } | null
  const loc = r?.location
  const code = text(r?.code)
  if (!r || !code || !loc) return null
  if (!isNumber(loc.longitude) || !isNumber(loc.latitude) || !isNumber(loc.city_code)) return null
  const address = text(loc.address_full) || text(loc.address)
  if (!address) return null
  return {
    cityCode: loc.city_code,
    point: {
      id: code,
      name: text(r.name) || code,
      address,
      ...(typeof r.is_dressing_room === 'boolean' ? { has_fitting: r.is_dressing_room } : {}),
      is_cash_available: r.have_cash === true,
      is_card_available: r.have_cashless === true,
      working_hours: workingHoursFrom(r.work_time_list),
      coordinates: { lat: loc.latitude, lon: loc.longitude },
      time_zone: approxTimeZone(loc.longitude),
      display_service_type: 'cdek',
    },
  }
}

// Все ПВЗ с выдачей по России. Страница короче size — последняя. По коду:
// стабильный порядок для пагинации Яндекса.
export async function fetchCdekPickupPoints(cdek: CdekGet): Promise<PickupPointEntry[]> {
  const byCode = new Map<string, PickupPointEntry>()
  for (let page = 0; page < CDEK_MAX_PAGES; page++) {
    const raw = await cdek.get<unknown>('/deliverypoints', {
      country_code: 'RU',
      type: 'PVZ',
      is_handout: true,
      size: CDEK_PAGE_SIZE,
      page,
    })
    if (!Array.isArray(raw)) throw new Error('СДЭК вернул не список пунктов выдачи')
    for (const item of raw) {
      const entry = toPickupPointEntry(item)
      if (entry) byCode.set(entry.point.id, entry)
    }
    if (raw.length < CDEK_PAGE_SIZE) break
  }
  return [...byCode.values()].sort((a, b) =>
    a.point.id < b.point.id ? -1 : a.point.id > b.point.id ? 1 : 0,
  )
}

interface Snapshot {
  entries: PickupPointEntry[]
  byCode: Map<string, PickupPointEntry>
  builtAt: Date
}

let snapshot: Snapshot | null = null

function install(entries: PickupPointEntry[], builtAt: Date): void {
  snapshot = { entries, byCode: new Map(entries.map((e) => [e.point.id, e])), builtAt }
}

// Для тестов: модульный кеш иначе переживал бы соседние тесты.
export function setPickupPointsForTests(entries: PickupPointEntry[] | null): void {
  if (entries === null) snapshot = null
  else install(entries, new Date())
}

export function pickupPointsPage(
  limit: number,
  offset: number,
): { points: YcpPickupPoint[]; total: number } | null {
  if (!snapshot) return null
  return {
    points: snapshot.entries.slice(offset, offset + limit).map((e) => e.point),
    total: snapshot.entries.length,
  }
}

// not_ready — кеш ещё не собран, проверить пункт нечем; unknown — кеш есть, а
// пункта в нём нет.
export function lookupPickupPoint(code: string): PickupPointEntry | 'unknown' | 'not_ready' {
  if (!snapshot) return 'not_ready'
  return snapshot.byCode.get(code.trim()) ?? 'unknown'
}

export async function refreshPickupPoints(cdek: CdekGet, now: Date = new Date()): Promise<number> {
  const entries = await fetchCdekPickupPoints(cdek)
  // Пустой список — скорее сбой СДЭК, чем Россия без ПВЗ: прежний снимок не трогаем.
  if (entries.length === 0) throw new Error('СДЭК вернул пустой список пунктов выдачи')
  await AppDataSource.query(
    `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET entries = EXCLUDED.entries, built_at = EXCLUDED.built_at`,
    [JSON.stringify(entries), now],
  )
  install(entries, now)
  return entries.length
}

export async function loadPickupPointsSnapshot(): Promise<boolean> {
  const rows = (await AppDataSource.query(
    `SELECT entries, built_at FROM ycp_pickup_points_snapshot WHERE id = 1`,
  )) as { entries: unknown; built_at: Date }[]
  const row = rows[0]
  if (!row || !Array.isArray(row.entries) || row.entries.length === 0) return false
  install(row.entries as PickupPointEntry[], new Date(row.built_at))
  return true
}

// Запускается из api/src/index.ts: снимок из базы сразу, затем свежий список
// из СДЭК и обновление раз в 12 часов. No-op без YCP_API_TOKEN.
export function startPickupPointsJob(
  opts: { cdek?: CdekGet; intervalMs?: number; env?: NodeJS.ProcessEnv } = {},
): NodeJS.Timeout | null {
  if (!ycpTokenFromEnv(opts.env)) return null
  let running = false
  const run = (): void => {
    if (running) return
    running = true
    Promise.resolve()
      .then(() => refreshPickupPoints(opts.cdek ?? getCdekClient()))
      .then((count) => console.info(`ycp: пункты выдачи СДЭК обновлены — ${count}`))
      .catch((err) => console.error('ycp: пункты выдачи не обновлены —', describeCdekError(err)))
      .finally(() => {
        running = false
      })
  }
  loadPickupPointsSnapshot()
    .catch((err) =>
      console.error(
        'ycp: снимок пунктов выдачи не прочитан —',
        err instanceof Error ? err.message : String(err),
      ),
    )
    .finally(run)
  const timer = setInterval(run, opts.intervalMs ?? PICKUP_POINTS_REFRESH_MS)
  timer.unref()
  return timer
}
