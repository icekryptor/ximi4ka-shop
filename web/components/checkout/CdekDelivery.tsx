'use client'

import type { DeliveryMethod } from '@ximi4ka-shop/shared'
import { cdekWidgetServicePath, type ShippingQuoteResponse } from '@/lib/api'
import { SHIPPING_RULES } from '@/lib/checkout'
import { formatPeriod, isPostalCode, widgetGoods } from '@/lib/shipping'
import { formatRub } from '@/lib/stockLabel'
import { CityCombobox } from './CityCombobox'
import { CourierFields } from './CourierFields'
import { ERROR_CLASS, HINT_CLASS, LABEL_CLASS } from './fieldStyles'
import { PointCombobox } from './PointCombobox'
import { PvzMap } from './PvzMap'
import type { CdekDeliveryModel, QuoteView } from './useCdekDelivery'

export type DeliveryErrors = Partial<
  Record<'city' | 'point' | 'street' | 'postalCode' | 'delivery', string>
>

interface Props {
  delivery: CdekDeliveryModel
  // Места и тарифы для карты; null — не загрузились, карты нет.
  shipping: ShippingQuoteResponse | null
  errors: DeliveryErrors
}

const METHOD_TITLES: Record<DeliveryMethod, string> = {
  cdek_pvz: 'Пункт выдачи СДЭК',
  cdek_courier: 'Курьер СДЭК',
}

const METHODS: readonly DeliveryMethod[] = ['cdek_pvz', 'cdek_courier']

// «Пункт выдачи СДЭК — 390 ₽, 3–5 дн.»: цена и срок — с сервера (§5.1, п. 2).
function methodLabel(method: DeliveryMethod, view: QuoteView): string {
  const title = METHOD_TITLES[method]
  if (view.status === 'loading') return `${title} — ${view.refining ? 'пересчитываем' : 'считаем'}…`
  if (view.status === 'error') return `${title} — не удалось рассчитать`
  if (!view.quote) return title
  const price =
    view.quote.customerPriceRub === 0 ? 'бесплатно' : formatRub(view.quote.customerPriceRub)
  const period = formatPeriod(view.quote.periodMin, view.quote.periodMax)
  return `${title} — ${price}${period ? `, ${period}` : ''}`
}

// Блок «Доставка» (спека §5.1): город, способ, пункт с картой или адрес
// курьера. Ошибка формы видна, пока поле не заполнено: исправленное поле не
// держит старую ошибку до следующего нажатия «Оформить».
export function CdekDelivery({ delivery: d, shipping, errors }: Props) {
  const cityError = d.city ? undefined : errors.city
  const pointError = d.pointError ?? (d.point ? undefined : errors.point)
  const streetError = d.courier.street.trim() === '' ? errors.street : undefined
  const postalCode = d.courier.postalCode.trim()
  const postalError = postalCode === '' || isPostalCode(postalCode) ? undefined : errors.postalCode
  const deliveryError = d.quotes[d.method].status === 'ready' ? undefined : errors.delivery
  const quoteFailed = METHODS.some((m) => d.quotes[m].status === 'error')

  // Карта стоит вне условия «город выбран»: первая буква в поле «Город»
  // сбрасывает город, и без этого виджет уничтожался бы и создавался заново
  // (на телефоне ещё и сворачивался за кнопку). Пока грузится список нового
  // города или покупатель перепечатывает город, карта остаётся на месте.
  const pickup = d.method === 'cdek_pvz'
  const listForMap =
    d.pointsStatus === 'loading' ||
    (d.pointsStatus === 'ready' && d.points.length > 0) ||
    (d.pointsStatus === 'idle' && d.pointsSeen)
  const showMap = pickup && listForMap

  return (
    <section aria-labelledby="checkout-delivery" className="flex flex-col gap-5">
      <h2 id="checkout-delivery" className={`${LABEL_CLASS} m-0`}>
        Доставка СДЭК *
      </h2>
      <p className={HINT_CLASS}>
        До пункта выдачи — бесплатно от {formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)}, курьером —
        от {formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)}
      </p>

      <CityCombobox id="checkout-city" value={d.city} onChange={d.setCity} error={cityError} />

      {d.city && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${LABEL_CLASS} mb-2`}>Способ получения</legend>
          {METHODS.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]"
            >
              <input
                type="radio"
                name="checkout-delivery-method"
                value={m}
                checked={d.method === m}
                onChange={() => d.setMethod(m)}
                className="accent-[var(--color-lj-ink)]"
              />
              {methodLabel(m, d.quotes[m])}
            </label>
          ))}
          {quoteFailed && (
            <button
              type="button"
              onClick={d.retryQuotes}
              className="self-start font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] underline"
            >
              Повторить расчёт
            </button>
          )}
        </fieldset>
      )}

      {d.city && pickup && <PickupList delivery={d} error={pointError} />}

      {pickup && d.mapNotice && (
        <p role="status" className={ERROR_CLASS}>
          {d.mapNotice}
        </p>
      )}

      {showMap && shipping && (
        <PvzMap
          goods={widgetGoods(shipping.packages)}
          servicePath={cdekWidgetServicePath(shipping.subtotalRub)}
          tariffPvz={shipping.tariffs.pvz}
          cityLocation={d.cityLocation}
          selectedPoint={d.point}
          onChoose={d.chooseOnMap}
        />
      )}

      {d.city && d.method === 'cdek_courier' && (
        <CourierFields
          value={d.courier}
          onChange={d.setCourier}
          errors={{ street: streetError, postalCode: postalError }}
        />
      )}

      {deliveryError && <p className={ERROR_CLASS}>{deliveryError}</p>}
    </section>
  )
}

// Поле «Пункт получения» или статус списка на его месте. Обёртка всегда одна
// и та же (`<div>`), а меняется только её первый ребёнок: список пунктов
// перезагружается синхронно с показом ошибки (после отказа сервера), и без
// общей обёртки React размонтировал бы параграф с ошибкой вместе со сменой
// ветки — `findByText` успевал бы поймать узел, который тут же исчезает.
function PickupList({
  delivery: d,
  error,
}: {
  delivery: CdekDeliveryModel
  error: string | undefined
}) {
  return (
    <div className="flex flex-col gap-2">
      {d.pointsStatus === 'ready' && d.points.length > 0 ? (
        <PointCombobox
          id="checkout-point"
          points={d.points}
          value={d.point}
          onChange={d.setPoint}
        />
      ) : d.pointsStatus === 'error' ? (
        <p role="alert" className={ERROR_CLASS}>
          Не удалось загрузить пункты выдачи{' '}
          <button type="button" onClick={d.retryPoints} className="underline">
            Повторить
          </button>
        </p>
      ) : d.pointsStatus === 'ready' ? (
        <p role="status" className={HINT_CLASS}>
          В этом городе нет пунктов выдачи СДЭК — выберите курьера
        </p>
      ) : (
        <p role="status" className={HINT_CLASS}>
          Загружаем пункты выдачи…
        </p>
      )}
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
