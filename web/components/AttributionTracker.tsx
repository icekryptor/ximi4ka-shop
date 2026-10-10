'use client'

import { useEffect } from 'react'
import { recordVisit, safeLocalStorage } from '@/lib/attribution'

// Запоминает, откуда пришёл посетитель (метки из адреса, referrer), чтобы
// передать это вместе с заказом. Layout не перемонтируется при переходах внутри
// сайта, поэтому эффект срабатывает один раз на полную загрузку: на странице входа.
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
