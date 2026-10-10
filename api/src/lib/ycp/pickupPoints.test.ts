import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import {
  CDEK_PAGE_SIZE,
  approxTimeZone,
  fetchCdekPickupPoints,
  loadPickupPointsSnapshot,
  lookupPickupPoint,
  pickupPointsPage,
  refreshPickupPoints,
  setPickupPointsForTests,
  startPickupPointsJob,
  toPickupPointEntry,
  workingHoursFrom,
} from './pickupPoints.js'

// Пункт так, как его отдаёт GET /v2/deliverypoints (урезан до нужных полей).
const RAW_POINT = {
  code: 'MSK123',
  name: ' Москва, Ленина ',
  type: 'PVZ',
  have_cash: true,
  have_cashless: false,
  is_dressing_room: true,
  work_time_list: [
    { day: 1, time: '10:00/20:00' },
    { day: 6, time: '11:00/16:00' },
  ],
  location: {
    city_code: 44,
    longitude: 37.62,
    latitude: 55.75,
    address: 'ул. Ленина, 1',
    address_full: 'Россия, Москва, ул. Ленина, 1',
  },
}

function rawPoint(code: string) {
  return { ...RAW_POINT, code }
}

function fakeCdek(pages: unknown[][]) {
  const get = vi.fn(async (_path: string, query?: Record<string, unknown>) => {
    return pages[Number(query?.page ?? 0)] ?? []
  })
  return { get } as unknown as Parameters<typeof fetchCdekPickupPoints>[0] & {
    get: typeof get
  }
}

describe('toPickupPointEntry', () => {
  it('переводит пункт СДЭК в формат Яндекса', () => {
    expect(toPickupPointEntry(RAW_POINT)).toEqual({
      cityCode: 44,
      point: {
        id: 'MSK123',
        name: 'Москва, Ленина',
        address: 'Россия, Москва, ул. Ленина, 1',
        has_fitting: true,
        is_cash_available: true,
        is_card_available: false,
        working_hours: { mon: '10:00-20:00', sat: '11:00-16:00' },
        coordinates: { lat: 55.75, lon: 37.62 },
        time_zone: 3,
        display_service_type: 'cdek',
      },
    })
  })

  it('пропускает пункт без кода, координат, города или адреса', () => {
    expect(toPickupPointEntry(null)).toBeNull()
    expect(toPickupPointEntry({ ...RAW_POINT, code: undefined })).toBeNull()
    expect(
      toPickupPointEntry({ ...RAW_POINT, location: { ...RAW_POINT.location, latitude: 'x' } }),
    ).toBeNull()
    expect(
      toPickupPointEntry({
        ...RAW_POINT,
        location: { ...RAW_POINT.location, city_code: undefined },
      }),
    ).toBeNull()
    expect(
      toPickupPointEntry({
        ...RAW_POINT,
        location: { ...RAW_POINT.location, address: ' ', address_full: '' },
      }),
    ).toBeNull()
  })
})

describe('workingHoursFrom', () => {
  it('понимает «/» и «-», пропускает мусор и выходные', () => {
    expect(
      workingHoursFrom([
        { day: 2, time: '09:00-21:00' },
        { day: 7, time: 'выходной' },
        { day: 9, time: '10:00/20:00' },
        null,
      ]),
    ).toEqual({ tue: '09:00-21:00' })
    expect(workingHoursFrom(undefined)).toEqual({})
  })
})

describe('approxTimeZone', () => {
  it.each([
    [37.62, 3],
    [20.51, 2],
    [60.6, 5],
    [92.87, 7],
    [158.65, 11],
    [-173.2, 12],
  ])('долгота %s → UTC+%s', (lon, tz) => {
    expect(approxTimeZone(lon)).toBe(tz)
  })
})

describe('fetchCdekPickupPoints', () => {
  it('листает СДЭК страницами, убирает повторы и сортирует по коду', async () => {
    const first = Array.from({ length: CDEK_PAGE_SIZE }, (_, i) =>
      rawPoint(`P${String(i).padStart(4, '0')}`),
    )
    const cdek = fakeCdek([first, [rawPoint('P0001'), rawPoint('A0001'), rawPoint('Z9999')]])
    const entries = await fetchCdekPickupPoints(cdek)
    expect(entries).toHaveLength(CDEK_PAGE_SIZE + 2)
    expect(entries[0].point.id).toBe('A0001')
    expect(entries.at(-1)!.point.id).toBe('Z9999')
    expect(cdek.get).toHaveBeenCalledTimes(2)
    expect(cdek.get).toHaveBeenNthCalledWith(1, '/deliverypoints', {
      country_code: 'RU',
      type: 'PVZ',
      is_handout: true,
      size: CDEK_PAGE_SIZE,
      page: 0,
    })
    expect(cdek.get).toHaveBeenNthCalledWith(
      2,
      '/deliverypoints',
      expect.objectContaining({ page: 1 }),
    )
  })

  it('ответ не-список — ошибка', async () => {
    const cdek = { get: vi.fn(async () => ({ error: 'x' })) } as never
    await expect(fetchCdekPickupPoints(cdek)).rejects.toThrow('не список')
  })
})

describe('снимок пунктов выдачи', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE ycp_pickup_points_snapshot')
    setPickupPointsForTests(null)
  })
  afterEach(() => {
    setPickupPointsForTests(null)
  })

  it('сохраняет снимок в базу и поднимает его после перезапуска', async () => {
    expect(await refreshPickupPoints(fakeCdek([[rawPoint('MSK1'), rawPoint('MSK2')]]))).toBe(2)
    expect(pickupPointsPage(10, 0)?.total).toBe(2)
    setPickupPointsForTests(null)
    expect(pickupPointsPage(10, 0)).toBeNull()
    expect(await loadPickupPointsSnapshot()).toBe(true)
    expect(pickupPointsPage(10, 0)?.points.map((p) => p.id)).toEqual(['MSK1', 'MSK2'])
  })

  it('пустой ответ СДЭК не затирает прежний снимок', async () => {
    await refreshPickupPoints(fakeCdek([[rawPoint('MSK1')]]))
    await expect(refreshPickupPoints(fakeCdek([[]]))).rejects.toThrow('пустой список')
    expect(pickupPointsPage(10, 0)?.total).toBe(1)
  })

  it('lookupPickupPoint различает «кеш не собран» и «нет такого пункта»', async () => {
    expect(lookupPickupPoint('MSK1')).toBe('not_ready')
    await refreshPickupPoints(fakeCdek([[rawPoint('MSK1')]]))
    expect(lookupPickupPoint('MSK1')).toMatchObject({ cityCode: 44, point: { id: 'MSK1' } })
    expect(lookupPickupPoint('NOPE')).toBe('unknown')
  })

  it('фоновая задача не запускается без токена YCP', () => {
    expect(startPickupPointsJob({ env: {} })).toBeNull()
  })

  it('фоновая задача с токеном сразу собирает кеш', async () => {
    const timer = startPickupPointsJob({
      env: { YCP_API_TOKEN: 'x'.repeat(32) },
      cdek: fakeCdek([[rawPoint('MSK1')]]),
      intervalMs: 60_000,
    })
    expect(timer).not.toBeNull()
    await vi.waitFor(() => expect(pickupPointsPage(10, 0)?.total).toBe(1))
    clearInterval(timer!)
  })
})
