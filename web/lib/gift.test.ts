import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  GIFT_SLUGS,
  GIFT_THRESHOLD_RUB,
  giftRemainingRub,
  loadGiftChoice,
  saveGiftChoice,
  useGiftChoice,
  type GiftChoice,
} from './gift'

// Путь переменной, а не литералом: vite переписывает литеральный new URL(…, import.meta.url) как ассет.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const choice: GiftChoice = { productId: 'p-1', slug: 'iodat-kaliya', name: 'Йодат калия' }

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('gift constants mirror the api', () => {
  it('порог и список реактивов совпадают с api/src/lib/gift.ts', () => {
    const api = read('../../api/src/lib/gift.ts')
    const threshold = Number(/GIFT_THRESHOLD_RUB = (\d+)/.exec(api)?.[1])
    const slugs = [...(/GIFT_SLUGS[^=]*= \[([^\]]*)\]/.exec(api)?.[1] ?? '').matchAll(/'([^']+)'/g)]
    expect(GIFT_THRESHOLD_RUB).toBe(threshold)
    expect([...GIFT_SLUGS]).toEqual(slugs.map((m) => m[1]))
  })

  it('три реактива на выбор', () => {
    expect([...GIFT_SLUGS]).toEqual(['azotnaya-kislota-10', 'solyanaya-kislota', 'iodat-kaliya'])
  })
})

describe('giftRemainingRub', () => {
  it('сколько не хватает до порога', () => {
    expect(giftRemainingRub(2400)).toBe(600)
    expect(giftRemainingRub(2999)).toBe(1)
  })

  it('от порога и выше — 0', () => {
    expect(giftRemainingRub(GIFT_THRESHOLD_RUB)).toBe(0)
    expect(giftRemainingRub(5000)).toBe(0)
  })
})

describe('выбор подарка в localStorage', () => {
  it('по умолчанию выбора нет', () => {
    expect(loadGiftChoice()).toBeNull()
  })

  it('сохраняется и читается', () => {
    saveGiftChoice(choice)
    expect(loadGiftChoice()).toEqual(choice)
  })

  it('null снимает выбор', () => {
    saveGiftChoice(choice)
    saveGiftChoice(null)
    expect(loadGiftChoice()).toBeNull()
  })

  it('битое значение в хранилище читается как «нет выбора»', () => {
    window.localStorage.setItem('ximi4ka-shop-gift', '{не json')
    expect(loadGiftChoice()).toBeNull()
    window.localStorage.setItem('ximi4ka-shop-gift', JSON.stringify({ productId: 1 }))
    expect(loadGiftChoice()).toBeNull()
  })
})

describe('useGiftChoice', () => {
  it('отдаёт выбор и обновляется при смене', () => {
    const { result } = renderHook(() => useGiftChoice())
    expect(result.current[0]).toBeNull()

    act(() => result.current[1](choice))
    expect(result.current[0]).toEqual(choice)

    act(() => result.current[1](null))
    expect(result.current[0]).toBeNull()
  })
})
