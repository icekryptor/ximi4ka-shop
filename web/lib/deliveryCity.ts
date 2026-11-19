import { useSyncExternalStore } from 'react'
import type { CdekCity } from '@ximi4ka-shop/shared'

// Город доставки покупателя: один на всю витрину. Его выбирают на чекауте или
// в чипе срока доставки, а читают чекаут и все чипы страницы. Хранится только
// код и название, без персональных данных (спека СДЭК §5.1, §7).
export const CITY_STORAGE_KEY = 'ximi4ka-checkout-city'

// Смена города в этой вкладке: событие storage приходит только в другие.
const CHANGE_EVENT = 'ximi4ka:delivery-city'

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CITY_STORAGE_KEY)
  } catch {
    // Приватный режим, запрет хранилища.
    return null
  }
}

// Мусор в хранилище — значит, сохранённого города просто нет.
function parseCity(raw: string | null): CdekCity | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CdekCity> | null
    if (
      !parsed ||
      typeof parsed.code !== 'number' ||
      !Number.isInteger(parsed.code) ||
      parsed.code <= 0 ||
      typeof parsed.name !== 'string' ||
      parsed.name === '' ||
      typeof parsed.fullName !== 'string'
    ) {
      return null
    }
    return { code: parsed.code, name: parsed.name, fullName: parsed.fullName }
  } catch {
    return null
  }
}

export function loadSavedCity(): CdekCity | null {
  if (typeof window === 'undefined') return null
  return parseCity(readRaw())
}

export function saveCity(city: CdekCity | null): void {
  try {
    if (city) {
      window.localStorage.setItem(
        CITY_STORAGE_KEY,
        JSON.stringify({ code: city.code, name: city.name, fullName: city.fullName }),
      )
    } else {
      window.localStorage.removeItem(CITY_STORAGE_KEY)
    }
  } catch {
    // Хранилище недоступно — город живёт до перезагрузки страницы.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

// useSyncExternalStore ждёт одну и ту же ссылку, пока данные не изменились:
// разбираем строку заново, только когда она стала другой.
let snapshotRaw: string | null | undefined
let snapshot: CdekCity | null = null

function getSnapshot(): CdekCity | null {
  const raw = readRaw()
  if (raw !== snapshotRaw) {
    snapshotRaw = raw
    snapshot = parseCity(raw)
  }
  return snapshot
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Город доставки для клиентского компонента; на сервере и до выбора — null. */
export function useDeliveryCity(): CdekCity | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
