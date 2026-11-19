import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCart, type CartItem } from './cart'
import { setMetrikaCounterId } from './metrika'
import { trackEvent } from './track'

type W = Window & { ym?: unknown; dataLayer?: unknown[] }
const w = window as W

const kit: Omit<CartItem, 'quantity'> = {
  productId: 'p1',
  slug: 'kit-1',
  name: 'Набор 1',
  priceRub: 1000,
}

function ecommerceEvents(): Array<Record<string, unknown>> {
  return (w.dataLayer ?? [])
    .map((e) => (e as { ecommerce: Record<string, unknown> | null }).ecommerce)
    .filter((e): e is Record<string, unknown> => e !== null) // без служебных сбросов
}

// События корзины уходят после отрисовки кадра (lib/afterPaint.ts): кадр и
// таймер подделаны, flush() прогоняет отложенную аналитику.
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  window.localStorage.clear()
  w.ym = vi.fn()
  w.dataLayer = []
  setMetrikaCounterId('777')
  vi.mocked(trackEvent).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

function flush(): void {
  vi.runAllTimers()
}

describe('useCart: события Метрики', () => {
  it('add: ecommerce add + цель add_to_cart', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    flush()
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
    flush()
    expect(ecommerceEvents()[0]).toMatchObject({
      add: { products: [{ quantity: 1 }] },
    })
  })

  it('remove: ecommerce remove с количеством строки, цели нет', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 3))
    flush()
    ;(w.ym as ReturnType<typeof vi.fn>).mockClear()
    w.dataLayer = []
    act(() => result.current.remove('p1'))
    flush()
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
    flush()
    ;(w.ym as ReturnType<typeof vi.fn>).mockClear()
    w.dataLayer = []
    act(() => result.current.setQty('p1', 5))
    flush()
    act(() => result.current.setQty('p1', 4))
    flush()
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
    flush()
    w.dataLayer = []
    act(() => result.current.setQty('p1', 0))
    flush()
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
    flush()
    w.dataLayer = []
    act(() => result.current.setQty('p1', 2))
    flush()
    act(() => result.current.remove('missing'))
    flush()
    expect(w.dataLayer).toEqual([])
  })

  it('clear (очистка после заказа) не шлёт remove', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    flush()
    w.dataLayer = []
    act(() => result.current.clear())
    flush()
    expect(w.dataLayer).toEqual([])
  })

  it('без счётчика корзина работает, события не отправляются', () => {
    setMetrikaCounterId(null)
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    flush()
    act(() => result.current.remove('p1'))
    flush()
    expect(w.dataLayer).toEqual([])
    expect(w.ym).not.toHaveBeenCalled()
  })
})

describe('useCart: аналитика после отрисовки', () => {
  it('клик пишет корзину сразу, а события уходят только после отрисовки', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add(kit, 2))
    // Корзина записана синхронно — интерфейс обновляется в том же кадре.
    expect(result.current.items).toEqual([{ ...kit, quantity: 2 }])
    expect(w.dataLayer).toEqual([])
    expect(w.ym).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()

    // Точная последовательность «кадр → таймер» проверена в afterPaint.test.ts.
    flush()
    expect(ecommerceEvents()).toHaveLength(1)
    expect(w.ym).toHaveBeenCalledWith('777', 'reachGoal', 'add_to_cart', {
      product_id: 'p1',
      quantity: 2,
    })
    expect(trackEvent).toHaveBeenCalledWith('add_to_cart', { product_id: 'p1', quantity: 2 })
  })

  it('порядок ecommerce-пакетов совпадает с порядком действий', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(kit, 2)
      result.current.setQty('p1', 5)
      result.current.remove('p1')
    })
    expect(w.dataLayer).toEqual([])
    flush()
    expect(ecommerceEvents()).toEqual([
      {
        currencyCode: 'RUB',
        add: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 2 }] },
      },
      {
        currencyCode: 'RUB',
        add: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 3 }] },
      },
      {
        currencyCode: 'RUB',
        remove: { products: [{ id: 'p1', name: 'Набор 1', price: 1000, quantity: 5 }] },
      },
    ])
  })
})
