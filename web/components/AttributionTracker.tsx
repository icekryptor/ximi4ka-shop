'use client'

import { useEffect } from 'react'
import { recordVisit, safeLocalStorage } from '@/lib/attribution'

// Запоминает, откуда пришёл посетитель (метки из адреса, referrer), чтобы
// передать это вместе с заказом. Layout не перемонтируется при переходах внутри
// сайта, поэтому эффект срабатывает на загрузке страницы входа (и ещё раз при
// смене языка: безвредно, первое касание уже записано, а адрес без меток
// последнее не трогает).
export function AttributionTracker() {
  useEffect(() => {
    recordVisit(safeLocalStorage(), {
      href: window.location.href,
      referrer: document.referrer,
      ownHost: window.location.hostname,
      now: new Date(),
    })
  }, [])
  return null
}
