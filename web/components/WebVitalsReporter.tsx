'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { notePage, startWebVitals } from '@/lib/webVitals'

// Полевые Web Vitals (lib/webVitals.ts). Стоит в root layout, чтобы видеть и
// переходы в админку: её INP сборщик отбрасывает сам. Эффект срабатывает после
// гидратации, а web-vitals грузится отдельным чанком — первый бандл не растёт.
// Каждая смена адреса отмечается: INP относится к странице, на которой был клик.
export function WebVitalsReporter() {
  const pathname = usePathname()

  useEffect(() => {
    void startWebVitals()
  }, [])

  useEffect(() => {
    if (pathname) notePage(pathname)
  }, [pathname])

  return null
}
