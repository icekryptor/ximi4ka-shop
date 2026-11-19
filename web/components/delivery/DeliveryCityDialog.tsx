'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CdekCity } from '@ximi4ka-shop/shared'
import { CityCombobox } from '@/components/checkout/CityCombobox'

interface Props {
  onChoose: (city: CdekCity) => void
  onClose: () => void
}

const FOCUSABLE = 'input, button:not([tabindex="-1"])'

// Окно выбора города для чипа срока доставки: то же поле с подсказками СДЭК,
// что на чекауте. Рисуется поверх страницы и выдвижной корзины (z выше её 56),
// прижато к верху — под полем остаётся место для списка городов и клавиатуры.
export function DeliveryCityDialog({ onChoose, onClose }: Props) {
  const fieldId = useId()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.getElementById(fieldId)?.focus()
    // Страница под окном не прокручивается; прежнее значение возвращаем — окно
    // может открыться поверх корзины, которая прокрутку уже заблокировала.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [fieldId])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Не даём Escape закрыть заодно и корзину под окном.
      e.stopPropagation()
      // Открыт список городов — первый Escape закрывает только его (это
      // делает само поле), окно закроет следующий.
      const target = e.target as HTMLElement
      if (target.getAttribute('aria-expanded') === 'true') return
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    // Tab ходит по кругу внутри окна и не уводит на страницу под ним.
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        ref={panelRef}
        className="relative flex w-full max-w-md flex-col gap-4 bg-[var(--color-lj-cream)] p-6 shadow-[var(--shadow-lj-bright)]"
      >
        <h2
          id={titleId}
          className="m-0 pr-10 font-lj-display text-xl font-[900] tracking-[-0.04em] text-[var(--color-lj-ink)]"
        >
          Город доставки
        </h2>
        <CityCombobox
          id={fieldId}
          label="Город"
          value={null}
          onChange={(city) => {
            if (city) onChoose(city)
          }}
        />
        <p className="m-0 font-ys-text text-[0.8125rem] leading-[1.4] text-black/60">
          Покажем срок доставки до пункта выдачи СДЭК в вашем городе.
        </p>
        {/* В разметке после поля: Tab идёт «поле → закрыть», как на экране сверху вниз. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть окно"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center text-[var(--color-lj-ink)] opacity-60 hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
