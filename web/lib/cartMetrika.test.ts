import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCart, type CartItem } from './cart'
import { setMetrikaCounterId } from './metrika'

type W = Window & { ym?: unknown; dataLayer?: unknown[] }
const w = window as W

const kit: Omit<CartItem, 'quantity'> = {
  productId: 'p1',
  slug: 'kit-1',
  name: 'Набор 1',
  priceRub: 1000,
}

function ecommerceEvents(): Array<Record<string, unknown>> {
  return (w.dataLayer ?? []).map((e) => (e as { ecommerce: Record<string, unknown> }).ecommerce)
}

beforeEach(() => {
  window.localStorage.clear()
  w.ym = vi.fn()
  w.dataLayer = []
  setMetrikaCounterId('777')
})

describe('useCart: события Метрики', () => {
  it('add: ecommerce add + цель add_to_cart', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    expect(ecommerceEvents()).toEqual([
      {
        currencyCode: 'RUB',
        add: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 2 }] },
      },
    ])
    expect(w.ym).toHaveBeenCalledWith('777', 'reachGoal', 'add_to_cart', {
      product_id: 'p1',
      quantity: 2,
    })
  })

  it('add без количества считается за 1', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit))
    expect(ecommerceEvents()[0]).toMatchObject({
      add: { products: [{ quantity: 1 }] },
    })
  })

  it('remove: ecommerce remove с количеством строки, цели нет', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 3))
    ;(w.ym as ReturnType<typeof vi.fn>).mockClear()
    w.dataLayer = []
    act(() => result.current.remove('p1'))
    expect(ecommerceEvents()).toEqual([
      {
        currencyCode: 'RUB',
        remove: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 3 }] },
      },
    ])
    expect(w.ym).not.toHaveBeenCalled()
  })

  it('setQty: увеличение — add на разницу, уменьшение — remove на разницу, без цели', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    ;(w.ym as ReturnType<typeof vi.fn>).mockClear()
    w.dataLayer = []
    act(() => result.current.setQty('p1', 5))
    act(() => result.current.setQty('p1', 4))
    expect(ecommerceEvents()).toEqual([
      {
        currencyCode: 'RUB',
        add: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 3 }] },
      },
      {
        currencyCode: 'RUB',
        remove: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 1 }] },
      },
    ])
    expect(w.ym).not.toHaveBeenCalled()
  })

  it('setQty(0) удаляет строку целиком — remove на всё количество', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    w.dataLayer = []
    act(() => result.current.setQty('p1', 0))
    expect(ecommerceEvents()).toEqual([
      {
        currencyCode: 'RUB',
        remove: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 2 }] },
      },
    ])
  })

  it('setQty с тем же количеством и удаление отсутствующего ничего не шлют', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    w.dataLayer = []
    act(() => result.current.setQty('p1', 2))
    act(() => result.current.remove('missing'))
    expect(w.dataLayer).toEqual([])
  })

  it('clear (очистка после заказа) не шлёт remove', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    w.dataLayer = []
    act(() => result.current.clear())
    expect(w.dataLayer).toEqual([])
  })

  it('без счётчика корзина работает, события не отправляются', () => {
    setMetrikaCounterId(null)
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    act(() => result.current.remove('p1'))
    expect(w.dataLayer).toEqual([])
    expect(w.ym).not.toHaveBeenCalled()
  })
})
