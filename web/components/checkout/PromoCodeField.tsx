'use client'

import { useState } from 'react'
import type { Promo } from '@ximi4ka-shop/shared/types/promo'
import { ERROR_CLASS, FIELD_CLASS, HINT_CLASS, LABEL_CLASS } from './fieldStyles'

interface Props {
  /** Применённый код; null — поле ввода. */
  applied: Promo | null
  error: string | null
  onApply: (code: string) => void
  onRemove: () => void
}

const BUTTON_CLASS =
  'px-5 py-3 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-cream-shade)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * Поле промокода в сводке заказа. Форму заказа оно не отправляет: Enter в поле
 * применяет код. Размер скидки показывает сводка, а сервер всё равно пересчитает.
 */
export function PromoCodeField({ applied, error, onApply, onRemove }: Props) {
  const [value, setValue] = useState('')

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className={`${HINT_CLASS} !opacity-100`}>
          Промокод {applied.code} · −{applied.percent}%
        </p>
        <button
          type="button"
          onClick={() => {
            setValue('')
            onRemove()
          }}
          className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] underline underline-offset-4 text-[var(--color-lj-ink)]"
        >
          Убрать
        </button>
      </div>
    )
  }

  const submit = () => {
    if (value.trim() !== '') onApply(value)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="checkout-promo" className={LABEL_CLASS}>
        Промокод
      </label>
      <div className="flex gap-2">
        <input
          id="checkout-promo"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // Enter в поле — «применить», а не «оформить заказ».
            e.preventDefault()
            submit()
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'checkout-promo-error' : undefined}
          className={`${FIELD_CLASS} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={value.trim() === ''}
          className={BUTTON_CLASS}
        >
          Применить
        </button>
      </div>
      {error && (
        <p id="checkout-promo-error" role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  )
}
