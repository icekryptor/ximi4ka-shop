'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

// Подарок к заказу: один реактив на выбор, если за товары (после скидок)
// платят не меньше порога. Порог и список — зеркало api/src/lib/gift.ts; сервер
// перепроверяет выбор, здесь они нужны для плашки.
export const GIFT_THRESHOLD_RUB = 3000

export const GIFT_SLUGS: readonly string[] = [
  'azotnaya-kislota-10',
  'solyanaya-kislota',
  'iodat-kaliya',
]

/** Выбранный подарок: название храним сразу, чтобы чекаут показал строку без запроса. */
export interface GiftChoice {
  productId: string
  slug: string
  name: string
}

const STORAGE_KEY = 'ximi4ka-shop-gift'
const EVENT_NAME = 'gift-updated'

/** Сколько не хватает до подарка; 0 — подарок открыт. */
export function giftRemainingRub(totalRub: number): number {
  return Math.max(0, GIFT_THRESHOLD_RUB - totalRub)
}

function parseChoice(raw: string | null): GiftChoice | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { productId, slug, name } = value as Record<string, unknown>
    if (typeof productId !== 'string' || typeof slug !== 'string' || typeof name !== 'string') {
      return null
    }
    return { productId, slug, name }
  } catch {
    return null
  }
}

export function loadGiftChoice(): GiftChoice | null {
  if (typeof window === 'undefined') return null
  try {
    return parseChoice(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveGiftChoice(choice: GiftChoice | null): void {
  if (typeof window === 'undefined') return
  try {
    if (choice) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Хранилище закрыто (приватный режим): выбор живёт до перезагрузки страницы.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT_NAME, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT_NAME, onChange)
    window.removeEventListener('storage', onChange)
  }
}

// Снимок — сырая строка: примитив сравнивается по значению, и
// useSyncExternalStore не перерисовывает компонент зря.
function getRawSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function useGiftChoice(): [GiftChoice | null, (choice: GiftChoice | null) => void] {
  const raw = useSyncExternalStore(subscribe, getRawSnapshot, () => null)
  const set = useCallback((choice: GiftChoice | null) => saveGiftChoice(choice), [])
  const choice = useMemo(() => parseChoice(raw), [raw])
  return [choice, set]
}
