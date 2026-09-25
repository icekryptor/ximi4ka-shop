import { describe, it, expect } from 'vitest'
import { TtlCache } from './locations.js'

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
