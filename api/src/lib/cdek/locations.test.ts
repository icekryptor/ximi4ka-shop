import { describe, it, expect, vi } from 'vitest'
import { TtlCache, clearCdekLocationCache, getCityPoints } from './locations.js'

describe('TtlCache', () => {
  it('отдаёт значение до истечения срока и забывает после', () => {
    let t = 1_000
    const cache = new TtlCache<string>(100, 10, () => t)
    cache.set('a', 'x')
    t = 1_099
    expect(cache.get('a')).toBe('x')
    t = 1_100
    expect(cache.get('a')).toBeUndefined()
  })

  it('не растёт больше предела: вытесняет самую старую запись', () => {
    const cache = new TtlCache<number>(60_000, 2, () => 0)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('повторная запись ключа обновляет срок и не вытесняет соседей', () => {
    let t = 0
    const cache = new TtlCache<number>(100, 2, () => t)
    cache.set('a', 1)
    cache.set('b', 2)
    t = 50
    cache.set('a', 10)
    t = 120
    expect(cache.get('a')).toBe(10)
    expect(cache.get('b')).toBeUndefined()
  })

  it('у записи может быть свой, более короткий срок', () => {
    let t = 0
    const cache = new TtlCache<number>(1_000, 10, () => t)
    cache.set('long', 1)
    cache.set('short', 2, 100)
    t = 100
    expect(cache.get('short')).toBeUndefined()
    expect(cache.get('long')).toBe(1)
  })
})

describe('getCityPoints', () => {
  it('обрезает пробелы по краям name, address и workTime (живой пример — песочница Петербурга)', async () => {
    clearCdekLocationCache()
    const get = vi.fn(async (path: string) => {
      if (path === '/deliverypoints') {
        return [
          {
            code: 'SPB310',
            name: ' SPB310, Санкт-Петербург ',
            work_time: ' Пн-Пт 10:00-20:00 ',
            location: {
              address: 'пр-т Народного Ополчения, 10, 221н ',
              longitude: 30.2,
              latitude: 59.9,
            },
          },
        ]
      }
      if (path === '/location/cities') return [{ city: 'Санкт-Петербург' }]
      throw new Error(`неожиданный запрос: ${path}`)
    })
    const result = await getCityPoints({ get }, 137)
    expect(result.points).toEqual([
      {
        code: 'SPB310',
        name: 'SPB310, Санкт-Петербург',
        address: 'пр-т Народного Ополчения, 10, 221н',
        location: [30.2, 59.9],
        workTime: 'Пн-Пт 10:00-20:00',
      },
    ])
  })
})
