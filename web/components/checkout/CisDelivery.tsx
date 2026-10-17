'use client'

import {
  CIS_CITIES,
  CIS_COUNTRIES,
  CIS_COUNTRY_NAMES,
  CIS_DELIVERY_RULES,
  type CisCountry,
} from '@ximi4ka-shop/shared/types/cis'
import { formatRub } from '@/lib/stockLabel'
import { ERROR_CLASS, FIELD_CLASS, HINT_CLASS, LABEL_CLASS } from './fieldStyles'
import type { CisDeliveryModel } from './useCisDelivery'

export type CisDeliveryErrors = Partial<Record<'country' | 'cisCity' | 'cisAddress', string>>

interface Props {
  delivery: CisDeliveryModel
  errors: CisDeliveryErrors
}

// Блок «Доставка СДЭК» для Беларуси, Казахстана, Армении и Киргизии: страна, город
// только из списка городов с ПВЗ, адрес пункта вручную. Ошибка поля видна, пока оно
// не заполнено правильно.
export function CisDelivery({ delivery: d, errors }: Props) {
  const rule = d.country ? CIS_DELIVERY_RULES[d.country] : null
  const countryError = d.country ? undefined : errors.country
  const cityError = d.city ? undefined : errors.cisCity
  const addressError = d.address.trim() === '' ? errors.cisAddress : undefined

  return (
    <section aria-labelledby="checkout-cis-delivery" className="flex flex-col gap-5">
      <h2 id="checkout-cis-delivery" className={`${LABEL_CLASS} m-0`}>
        Доставка СДЭК в другую страну *
      </h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-country" className={LABEL_CLASS}>
          Страна *
        </label>
        <select
          id="checkout-cis-country"
          value={d.country ?? ''}
          onChange={(e) => d.setCountry((e.target.value || null) as CisCountry | null)}
          aria-invalid={countryError ? true : undefined}
          className={FIELD_CLASS}
        >
          {/* Текст не совпадает с ошибкой «Выберите страну», чтобы они различались в DOM. */}
          <option value="">Страна не выбрана</option>
          {CIS_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {CIS_COUNTRY_NAMES[c]}
            </option>
          ))}
        </select>
        {countryError && <p className={ERROR_CLASS}>{countryError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-city" className={LABEL_CLASS}>
          Город *
        </label>
        <select
          id="checkout-cis-city"
          value={d.city}
          disabled={!d.country}
          onChange={(e) => d.setCity(e.target.value)}
          aria-invalid={cityError ? true : undefined}
          className={FIELD_CLASS}
        >
          <option value="">Выберите город</option>
          {d.country &&
            CIS_CITIES[d.country].map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
        </select>
        {d.country && (
          <p className={HINT_CLASS}>Нет вашего города? Доставка туда пока невозможна.</p>
        )}
        {cityError && <p className={ERROR_CLASS}>{cityError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-address" className={LABEL_CLASS}>
          Адрес пункта выдачи СДЭК *
        </label>
        <input
          id="checkout-cis-address"
          type="text"
          autoComplete="off"
          placeholder="Улица, дом пункта выдачи СДЭК в вашем городе"
          value={d.address}
          onChange={(e) => d.setAddress(e.target.value)}
          aria-invalid={addressError ? true : undefined}
          className={FIELD_CLASS}
        />
        {addressError && <p className={ERROR_CLASS}>{addressError}</p>}
      </div>

      {rule && (
        <p className={HINT_CLASS}>
          Бесплатно от {formatRub(rule.freeFromRub)}, иначе {formatRub(rule.priceRub)}
        </p>
      )}
    </section>
  )
}
