'use client'

import { useState } from 'react'
import {
  cisShippingRub,
  isCisCity,
  type CisCountry,
  type CisDeliveryDestination,
} from '@ximi4ka-shop/shared/types/cis'

export interface CisDeliveryModel {
  country: CisCountry | null
  setCountry: (country: CisCountry | null) => void
  city: string
  setCity: (city: string) => void
  address: string
  setAddress: (address: string) => void
  /** Цена доставки для суммы товаров за вычетом скидки; null — страна не выбрана. */
  shippingRub: (amountRub: number) => number | null
  /** Готово к отправке: страна, город из списка и адрес пункта; иначе null. */
  destination: CisDeliveryDestination | null
}

// Доставка в Беларусь, Казахстан, Армению, Киргизию: страна, город из списка
// городов с ПВЗ СДЭК и адрес пункта, который покупатель пишет сам. Цену считает
// shared (её же пересчитывает сервер); смена страны сбрасывает город.
export function useCisDelivery(): CisDeliveryModel {
  const [country, setCountryState] = useState<CisCountry | null>(null)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  function setCountry(next: CisCountry | null) {
    setCountryState(next)
    setCity('')
  }

  const trimmed = address.trim()
  return {
    country,
    setCountry,
    city,
    setCity,
    address,
    setAddress,
    shippingRub: (amountRub) => (country ? cisShippingRub(country, amountRub) : null),
    destination:
      country && isCisCity(country, city) && trimmed !== ''
        ? { method: 'cdek_manual_cis', country, city, address: trimmed }
        : null,
  }
}
