'use client'

import type { CourierAddress } from '@/lib/shipping'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from './fieldStyles'

interface Props {
  value: CourierAddress
  onChange: (value: CourierAddress) => void
  errors: { street?: string; postalCode?: string }
}

// Адрес курьера под выбранным городом (спека §5.1, п. 4): город уже выбран
// выше, здесь — улица с домом, квартира и индекс. Курьерская вкладка в
// виджете отключена, чтобы адрес вводился в одном месте.
export function CourierFields({ value, onChange, errors }: Props) {
  function set(key: keyof CourierAddress, next: string) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-street" className={LABEL_CLASS}>
          Улица, дом *
        </label>
        <input
          id="checkout-street"
          type="text"
          autoComplete="address-line1"
          value={value.street}
          onChange={(e) => set('street', e.target.value)}
          aria-invalid={errors.street ? true : undefined}
          className={FIELD_CLASS}
        />
        {errors.street && <p className={ERROR_CLASS}>{errors.street}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="checkout-apartment" className={LABEL_CLASS}>
            Квартира/офис
          </label>
          <input
            id="checkout-apartment"
            type="text"
            autoComplete="address-line2"
            value={value.apartment}
            onChange={(e) => set('apartment', e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="checkout-postal" className={LABEL_CLASS}>
            Индекс
          </label>
          <input
            id="checkout-postal"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={value.postalCode}
            // Только цифры: индекс в России — 6 цифр (§4.4).
            onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={errors.postalCode ? true : undefined}
            className={FIELD_CLASS}
          />
          {errors.postalCode && <p className={ERROR_CLASS}>{errors.postalCode}</p>}
        </div>
      </div>
    </div>
  )
}
