'use client'

interface Props {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** Уменьшенный вариант для компактной карточки. */
  size?: 'sm' | 'md'
  /** Доступное имя для группы (озвучивается скринридером). */
  ariaLabel?: string
}

/**
 * Степпер количества «− N +» в лаб-журнальном стиле: моно-цифры, острые
 * границы, пилюльные кнопки. Контролируемый — состояние держит родитель
 * (компактная карточка каталога), логику «добавить N штук» выполняет
 * AddToCartButton через проп quantity.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'sm',
  ariaLabel = 'Количество',
}: Props) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  const btn =
    size === 'sm'
      ? 'w-7 h-7 text-sm'
      : 'w-9 h-9 text-base'
  const cell =
    size === 'sm' ? 'min-w-7 text-[0.8125rem]' : 'min-w-9 text-[0.9375rem]'

  const btnClass = `${btn} inline-flex items-center justify-center border border-[var(--color-lj-ink)] rounded-full font-lj-mono leading-none transition-[background,color] duration-200 hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--color-lj-ink)]`

  return (
    <div
      className="inline-flex items-center gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Уменьшить количество"
        className={btnClass}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`${cell} inline-flex justify-center font-lj-mono tabular-nums text-[var(--color-lj-ink)]`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Увеличить количество"
        className={btnClass}
      >
        +
      </button>
    </div>
  )
}
