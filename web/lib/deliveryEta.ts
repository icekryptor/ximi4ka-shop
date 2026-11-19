import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DeliveryDates } from '@ximi4ka-shop/shared/types/deliveryDates'
import { getDeliveryEta } from '@/lib/api'
import { useDeliveryCity } from '@/lib/deliveryCity'

export { etaDayLabel, etaRangeLabel } from '@/lib/deliveryDateLabel'

// Срок доставки для чипа с грузовиком: один запрос на город с кешем на сессию —
// каталог с десятком карточек спрашивает api один раз.

// Ответ живёт в памяти вкладки недолго: дата «послезавтра» в полночь становится
// «завтра», а вкладку могут держать открытой сутками.
export const ETA_CLIENT_TTL_MS = 5 * 60_000

// Ключ 0 — город не выбран (самый быстрый возможный срок).
const cache = new Map<number, { at: number; request: Promise<DeliveryDates | null> }>()

export function loadDeliveryEta(cityCode: number | null): Promise<DeliveryDates | null> {
  const key = cityCode ?? 0
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ETA_CLIENT_TTL_MS) return hit.request
  const request = Promise.resolve()
    .then(() => getDeliveryEta(cityCode ?? undefined))
    .catch(() => null)
    .then((eta) => {
      // «Срока нет» и сбой не запоминаем: следующий чип попробует снова.
      if (eta === null && cache.get(key)?.request === request) cache.delete(key)
      return eta
    })
  cache.set(key, { at: Date.now(), request })
  return request
}

export function resetDeliveryEtaCacheForTests(): void {
  cache.clear()
}

const subscribeNever = () => () => {}

// false на сервере и в первом проходе гидратации, дальше true.
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
}

/**
 * Срок доставки в город покупателя. eta: undefined — ещё считается,
 * null — СДЭК не ответил (чип не показываем). refreshing — срок уже показывали
 * и пересчитываем для нового города.
 */
export function useDeliveryEta(): {
  city: ReturnType<typeof useDeliveryCity>
  eta: DeliveryDates | null | undefined
  refreshing: boolean
} {
  const city = useDeliveryCity()
  const hydrated = useHydrated()
  const cityCode = city?.code ?? null
  const [loaded, setLoaded] = useState<{ cityCode: number | null; eta: DeliveryDates | null }>()
  useEffect(() => {
    // При гидратации город ещё не прочитан из хранилища: запрос «без города»
    // был бы лишним для каждого, кто город уже выбрал.
    if (!hydrated) return
    let cancelled = false
    void loadDeliveryEta(cityCode).then((eta) => {
      if (!cancelled) setLoaded({ cityCode, eta })
    })
    return () => {
      cancelled = true
    }
  }, [cityCode, hydrated])
  // Ответ для прежнего города не показываем, пока едет новый.
  const current = loaded && loaded.cityCode === cityCode
  return {
    city,
    eta: current ? loaded.eta : undefined,
    refreshing: !current && loaded != null && loaded.eta !== null,
  }
}
