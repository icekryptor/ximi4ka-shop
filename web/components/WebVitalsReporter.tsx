'use client'

import { useEffect } from 'react'
import { startWebVitals } from '@/lib/webVitals'

// Полевые Web Vitals (lib/webVitals.ts). Эффект срабатывает после гидратации,
// а web-vitals грузится отдельным чанком — первый бандл не растёт. Метрики
// после переходов внутри сайта библиотека копит сама: перемонтировать не нужно.
export function WebVitalsReporter() {
  useEffect(() => {
    void startWebVitals()
  }, [])
  return null
}
