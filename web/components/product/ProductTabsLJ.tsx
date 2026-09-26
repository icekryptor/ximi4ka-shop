'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ProductTab {
  id: string
  label: string
  content: ReactNode
}

interface Props {
  tabs: ProductTab[]
}

/**
 * Вкладки описания на странице товара (Figma «Товар — 1440», 109:18535):
 * «Описание / Состав / Характеристики» — три равные колонки, IBM Plex
 * Medium 16 uppercase, активная — lj/brand с линией снизу, остальные —
 * ink 70% с бледной линией. С sm каждая вкладка — треть ширины и при
 * неполном наборе, бледная линия тянется до конца ряда; на телефоне
 * ширина по тексту, чтобы «Характеристики» не обрезались. Неактивные
 * панели остаются в DOM со `hidden`, чтобы текст отдавался сервером и
 * индексировался.
 */
export function ProductTabsLJ({ tabs }: Props) {
  const [active, setActive] = useState(0)
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  if (tabs.length === 0) return null
  // Список вкладок может укоротиться при ISR-обновлении — не выпадаем за край.
  const current = Math.min(active, tabs.length - 1)

  const focusTab = (idx: number) => {
    setActive(idx)
    tabRefs.current[idx]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const last = tabs.length - 1
    if (e.key === 'ArrowRight') focusTab(idx === last ? 0 : idx + 1)
    else if (e.key === 'ArrowLeft') focusTab(idx === 0 ? last : idx - 1)
    else if (e.key === 'Home') focusTab(0)
    else if (e.key === 'End') focusTab(last)
    else return
    e.preventDefault()
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div
        role="tablist"
        aria-label="О товаре"
        className="flex w-full shadow-[inset_0_-1px_0_var(--color-lj-bone)]"
      >
        {tabs.map((tab, i) => {
          const selected = i === current
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`grow sm:grow-0 sm:basis-1/3 pt-[5px] pb-2.5 text-left border-b font-lj-mono font-medium text-xs sm:text-base uppercase tracking-[0.05em] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] ${
                selected
                  ? 'border-[var(--color-lj-brand)] text-[var(--color-lj-brand)]'
                  : 'border-[var(--color-lj-bone)] text-[var(--color-lj-ink)] opacity-70 hover:opacity-100'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={i !== current}
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-lj-brand-deep)]"
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
