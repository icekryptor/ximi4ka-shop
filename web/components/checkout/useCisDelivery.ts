'use client'

import { useState } from 'react'
import {
  cisShippingRub,
  cisTaxIdError,
  CIS_TAX_ID,
  isCisCity,
  normalizeTaxId,
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
  /** ИИН (Казахстан) или ПИН (Киргизия) — для таможни; другим странам не нужен. */
  taxId: string
  setTaxId: (taxId: string) => void
  /** Цена доставки для суммы товаров за вычетом скидки; null — страна не выбрана. */
  shippingRub: (amountRub: number) => number | null
  /** Готово к отправке: страна, город из списка, адрес пункта и верный ИИН/ПИН, если нужен; иначе null. */
  destination: CisDeliveryDestination | null
}

// Доставка в Беларусь, Казахстан, Армению, Киргизию: страна, город из списка
// городов с ПВЗ СДЭК и адрес пункта, который покупатель пишет сам. Цену считает
// shared (её же пересчитывает сервер); смена страны сбрасывает город и ИИН/ПИН —
// у Казахстана и Киргизии номера разного формата.
export function useCisDelivery(): CisDeliveryModel {
  const [country, setCountryState] = useState<CisCountry | null>(null)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')

  function setCountry(next: CisCountry | null) {
    setCountryState(next)
    setCity('')
    setTaxId('')
  }

  const trimmed = address.trim()
  const ready =
    country && isCisCity(country, city) && trimmed !== '' && !cisTaxIdError(country, taxId)
  return {
    country,
    setCountry,
    city,
    setCity,
    address,
    setAddress,
    taxId,
    setTaxId,
    shippingRub: (amountRub) => (country ? cisShippingRub(country, amountRub) : null),
    destination: ready
      ? {
          method: 'cdek_manual_cis',
          country,
          city,
          address: trimmed,
          ...(CIS_TAX_ID[country] ? { taxId: normalizeTaxId(taxId) } : {}),
        }
      : null,
  }
}
