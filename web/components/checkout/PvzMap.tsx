'use client'

import { useState } from 'react'
import { CdekWidget, type CdekWidgetProps } from './CdekWidget'

// От 768 px карта стоит сразу под списком. Уже — за кнопкой: виджет и скрипты
// Яндекса тяжёлые, на телефоне пункт обычно ищут в списке, и грузить их стоит,
// только если покупатель попросил (спека §5.2).
export const MAP_INLINE_QUERY = '(min-width: 768px)'

// Блок доставки рендерится только после гидрации (page.tsx ждёт hydrated),
// поэтому window здесь есть и разметка сервера с клиентом не разойдётся.
function wideScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(MAP_INLINE_QUERY).matches
}

export function PvzMap(props: CdekWidgetProps) {
  const [shown, setShown] = useState(wideScreen)
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="self-start inline-flex items-center gap-2 px-5 py-3 border border-[var(--color-lj-ink)] font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)]"
      >
        Показать на карте
      </button>
    )
  }
  return <CdekWidget {...props} />
}
