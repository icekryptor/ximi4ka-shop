'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Форма «где мой заказ»: спрашиваем номер и уводим на публичную страницу
// статуса. Сам статус живёт на /order/[number] — здесь только навигация.
export function TrackOrderForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Номера вида XM-2026-00042: терпимо относимся к регистру и пробелам.
    const number = value.trim().toUpperCase()
    if (number === '') {
      setError('Введите номер заказа')
      return
    }
    router.push(`/order/${encodeURIComponent(number)}`)
  }

  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[70vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
          ЗАКАЗ · ПОИСК
        </p>

        <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] mb-6 text-[var(--color-lj-ink)]">
          Отследить заказ
        </h1>

        <p className="text-lg text-[var(--color-lj-ink)] opacity-70 max-w-[48ch] mb-10">
          Введите номер заказа — он указан в письме и SMS, которые мы отправили
          после оформления.
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 max-w-md">
          <label
            htmlFor="track-number"
            className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70"
          >
            Номер заказа
          </label>
          <input
            id="track-number"
            type="text"
            placeholder="XM-2026-00042"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-full px-4 py-3 bg-transparent border border-[var(--color-lj-rule)] font-lj-mono text-base tracking-[0.04em] text-[var(--color-lj-ink)] placeholder:opacity-40 focus:outline-none focus:border-[var(--color-lj-ink)] transition-colors"
          />
          {error && (
            <p
              role="alert"
              className="font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-stock-danger)] m-0"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="self-start inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-300 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]"
          >
            Найти заказ →
          </button>
        </form>
      </div>
    </section>
  )
}
