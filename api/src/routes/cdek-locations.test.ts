import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { CdekError, setCdekClientForTests } from '../lib/cdek/index.js'
import { EMPTY_POINTS_TTL_MS, clearCdekLocationCache } from '../lib/cdek/locations.js'

const CITIES = '/api/public/cdek/cities'
const POINTS = '/api/public/cdek/points'

// Ответы песочницы СДЭК 25.09.2026, урезанные до полей, которые мы читаем,
// и пары лишних — их в нашем ответе быть не должно.
const MOSCOW_SUGGEST = {
  city_uuid: '7e2e4f9a-6a1b-4c1e-9d3b-1f2a3b4c5d6e',
  code: 44,
  full_name: 'Москва, Россия',
  country_code: 'RU',
}
const NALCHIK_SUGGEST = {
  city_uuid: '0b6f1c2d-3e4f-4a5b-8c7d-9e0f1a2b3c4d',
  code: 1106,
  full_name: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
  country_code: 'RU',
}
const MOSCOW_CITY = [
  { code: 44, city: 'Москва', longitude: 37.6176, latitude: 55.7558, region: 'Москва' },
]

function rawPoint(code: string, address: string) {
  return {
    code,
    name: `${code}, Москва, ${address.split(',')[0]}`,
    type: 'PVZ',
    is_handout: true,
    work_time: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
    phones: [{ number: '+74951234567' }],
    office_image_list: [{ url: 'https://example.test/photo.jpg' }],
    work_time_list: [{ day: 1, time: '10:00/20:00' }],
    location: {
      city_code: 44,
      city: 'Москва',
      postal_code: '125167',
      longitude: 37.5776,
      latitude: 55.7903,
      address,
      address_full: `Россия, Москва, ${address}`,
    },
  }
}

// Подменяет клиент СДЭК: ответ — по пути запроса; Error — СДЭК «упал».
function stubCdek(routes: Record<string, unknown>) {
  const get = vi.fn()
  get.mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new Error(`неожиданный запрос в СДЭК: ${path}`)
    const answer = routes[path]
    if (answer instanceof Error) throw answer
    return answer
  })
  setCdekClientForTests({ get, post: vi.fn(), raw: vi.fn() })
  return get
}

let app: ReturnType<typeof createApp>
beforeAll(() => {
  app = createApp()
})
afterEach(() => {
  setCdekClientForTests(null)
  clearCdekLocationCache()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/public/cdek/cities', () => {
  it('обрезает q и спрашивает СДЭК только по России', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    const res = await request(app).get(CITIES).query({ q: '  Моск ' })
    expect(res.status).toBe(200)
    expect(get).toHaveBeenCalledWith('/location/suggest/cities', {
      name: 'Моск',
      country_code: 'RU',
    })
  })

  it('отдаёт code, name — первую часть full_name — и fullName', async () => {
    stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST, NALCHIK_SUGGEST] })
    const res = await request(app).get(CITIES).query({ q: 'на' })
    expect(res.body).toEqual({
      data: [
        { code: 44, name: 'Москва', fullName: 'Москва, Россия' },
        {
          code: 1106,
          name: 'Нальчик',
          fullName: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
        },
      ],
    })
  })

  it('не больше 10 городов', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...MOSCOW_SUGGEST,
      code: 1000 + i,
      full_name: `Город ${i}, Россия`,
    }))
    stubCdek({ '/location/suggest/cities': many })
    const res = await request(app).get(CITIES).query({ q: 'город' })
    expect(res.body.data).toHaveLength(10)
  })

  it('400 на q короче 2 символов после обрезки, длиннее 100 или без q — в СДЭК не ходим', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    expect((await request(app).get(CITIES).query({ q: ' м ' })).status).toBe(400)
    expect(
      (
        await request(app)
          .get(CITIES)
          .query({ q: 'а'.repeat(101) })
      ).status,
    ).toBe(400)
    expect((await request(app).get(CITIES)).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })

  it('кеширует по q без учёта регистра: второй запрос не идёт в СДЭК', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    await request(app).get(CITIES).query({ q: 'моск' })
    const res = await request(app).get(CITIES).query({ q: 'МОСК' })
    expect(res.body.data).toEqual([{ code: 44, name: 'Москва', fullName: 'Москва, Россия' }])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('СДЭК недоступен — 502 cdek_unavailable; в лог — код ошибки, без текста запроса', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Сообщение сетевой ошибки содержит адрес запроса с тем, что набрал покупатель.
    stubCdek({
      '/location/suggest/cities': new CdekError(
        0,
        'network_error',
        'СДЭК недоступен: fetch …/location/suggest/cities?name=моск failed',
      ),
    })
    const res = await request(app).get(CITIES).query({ q: 'моск' })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('cdek_unavailable')
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls[0]!.join(' ')
    expect(logged).toContain('network_error')
    expect(logged).not.toContain('моск')
  })
})

describe('GET /api/public/cdek/points', () => {
  it('спрашивает у СДЭК только ПВЗ с выдачей и центр города', async () => {
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK65', 'ул. Динамовская, 1А, 110а')],
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(200)
    expect(get).toHaveBeenCalledWith('/deliverypoints', {
      city_code: 44,
      type: 'PVZ',
      is_handout: true,
    })
    expect(get).toHaveBeenCalledWith('/location/cities', { code: 44 })
  })

  it('урезанная форма без фото и телефонов, пункты по коду', async () => {
    stubCdek({
      '/deliverypoints': [
        rawPoint('MSK65', 'ул. Динамовская, 1А, 110а'),
        rawPoint('MSK1', 'ул. Ленина, 1'),
      ],
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.body).toEqual({
      data: {
        city: { code: 44, name: 'Москва', location: [37.6176, 55.7558] },
        points: [
          {
            code: 'MSK1',
            name: 'MSK1, Москва, ул. Ленина',
            address: 'ул. Ленина, 1',
            location: [37.5776, 55.7903],
            workTime: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
          },
          {
            code: 'MSK65',
            name: 'MSK65, Москва, ул. Динамовская',
            address: 'ул. Динамовская, 1А, 110а',
            location: [37.5776, 55.7903],
            workTime: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
          },
        ],
      },
    })
  })

  it('центр города неизвестен — location: null, пункты всё равно отдаём', async () => {
    stubCdek({ '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')], '/location/cities': [] })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.body.data.city).toEqual({ code: 44, name: '', location: null })
    expect(res.body.data.points).toHaveLength(1)
  })

  it('кеширует список города: второй запрос не идёт в СДЭК', async () => {
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')],
      '/location/cities': MOSCOW_CITY,
    })
    await request(app).get(POINTS).query({ cityCode: 44 })
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2) // пункты + город, один раз
  })

  it('пустой список — 200 с points: [], в кеше только 5 минут: сбой СДЭК не выключит ПВЗ на 6 часов', async () => {
    // Подменяем только Date: таймеры supertest и express остаются настоящими.
    vi.useFakeTimers({ toFake: ['Date'] })
    const get = stubCdek({ '/deliverypoints': [], '/location/cities': MOSCOW_CITY })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(200)
    expect(res.body.data.points).toEqual([])
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2) // второй запрос — из кеша
    vi.setSystemTime(Date.now() + EMPTY_POINTS_TTL_MS)
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(4) // через 5 минут — снова в СДЭК
  })

  it('непустой список живёт в кеше дольше 5 минут', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')],
      '/location/cities': MOSCOW_CITY,
    })
    await request(app).get(POINTS).query({ cityCode: 44 })
    vi.setSystemTime(Date.now() + EMPTY_POINTS_TTL_MS + 60_000)
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('400 на cityCode, который не положительное целое', async () => {
    const get = stubCdek({ '/deliverypoints': [], '/location/cities': [] })
    for (const cityCode of ['abc', '0', '-5', '1.5', '']) {
      expect((await request(app).get(POINTS).query({ cityCode })).status).toBe(400)
    }
    expect((await request(app).get(POINTS)).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })

  it('СДЭК недоступен — 502 cdek_unavailable, в логе код ошибки', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubCdek({
      '/deliverypoints': new CdekError(0, 'network_error', 'timeout'),
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('cdek_unavailable')
    expect(warn.mock.calls[0]!.join(' ')).toContain('network_error')
  })

  it('СДЭК ответил не списком — 502, а не падение', async () => {
    stubCdek({ '/deliverypoints': { requests: [] }, '/location/cities': MOSCOW_CITY })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(502)
  })
})
