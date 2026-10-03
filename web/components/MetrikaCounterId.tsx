'use client'

import { useLayoutEffect } from 'react'
import { setMetrikaCounterId } from '@/lib/metrika'

// Передаёт ID счётчика клиентским хелперам (lib/metrika.ts). Layout-эффект
// срабатывает раньше обычных эффектов страниц — первое событие (просмотр
// карточки товара) не теряется. Без счётчика не монтируется — хелперы no-op.
export function MetrikaCounterId({ counterId }: { counterId: string }) {
  useLayoutEffect(() => {
    setMetrikaCounterId(counterId)
    return () => setMetrikaCounterId(null)
  }, [counterId])
  return null
}
