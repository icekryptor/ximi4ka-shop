import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { CITY_STORAGE_KEY, loadSavedCity, saveCity, useDeliveryCity } from './deliveryCity'

const KAZAN = { code: 424, name: 'Казань', fullName: 'Казань, Татарстан, Россия' }
const MOSCOW = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }

afterEach(() => window.localStorage.clear())

describe('город доставки', () => {
  it('saveCity кладёт город туда же, откуда его читает чекаут', () => {
    saveCity(KAZAN)
    expect(JSON.parse(window.localStorage.getItem(CITY_STORAGE_KEY)!)).toEqual(KAZAN)
    expect(loadSavedCity()).toEqual(KAZAN)
  })

  it('мусор в хранилище — города нет', () => {
    window.localStorage.setItem(CITY_STORAGE_KEY, '{"code":"x"}')
    expect(loadSavedCity()).toBeNull()
  })
})

describe('useDeliveryCity', () => {
  it('отдаёт сохранённый город', () => {
    saveCity(KAZAN)
    const { result } = renderHook(() => useDeliveryCity())
    expect(result.current).toEqual(KAZAN)
  })

  it('без сохранённого города — null', () => {
    const { result } = renderHook(() => useDeliveryCity())
    expect(result.current).toBeNull()
  })

  it('выбор города в одном месте страницы сразу виден во всех остальных', () => {
    const a = renderHook(() => useDeliveryCity())
    const b = renderHook(() => useDeliveryCity())
    act(() => saveCity(MOSCOW))
    expect(a.result.current).toEqual(MOSCOW)
    expect(b.result.current).toEqual(MOSCOW)
    act(() => saveCity(null))
    expect(a.result.current).toBeNull()
  })

  it('город, выбранный в другой вкладке, подхватывается', () => {
    const { result } = renderHook(() => useDeliveryCity())
    act(() => {
      window.localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(KAZAN))
      window.dispatchEvent(new StorageEvent('storage', { key: CITY_STORAGE_KEY }))
    })
    expect(result.current).toEqual(KAZAN)
  })

  it('пока город не меняется, ссылка на него та же — лишних перерисовок нет', () => {
    saveCity(KAZAN)
    const { result, rerender } = renderHook(() => useDeliveryCity())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('хранилище недоступно — города нет, страница не падает', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result } = renderHook(() => useDeliveryCity())
    expect(result.current).toBeNull()
    spy.mockRestore()
  })
})
