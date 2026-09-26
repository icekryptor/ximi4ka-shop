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
 * Степпер количества «− N +» по макету (Figma «Атомы / QuantityStepper»):
 * пилюля высотой 40 с тонкой рамкой, кнопки без рамок внутри. S — компактная
 * карточка каталога, M — крупнее. Контролируемый — состояние держит родитель,
 * логику «добавить N штук» выполняет AddToCartButton через проп quantity.
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

  const box = size === 'sm' ? 'w-20' : 'px-0.5'
  const btn = size === 'sm' ? 'size-7 text-sm' : 'size-9 text-base'
  const cell = size === 'sm' ? 'text-[0.8125rem]' : 'text-[0.9375rem]'

  const btnClass = `${btn} inline-flex items-center justify-center rounded-full font-lj-mono leading-none text-[var(--color-lj-ink)] transition-colors duration-200 hover:bg-[var(--color-lj-rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`

  return (
    <div
      className={`${box} h-10 inline-flex shrink-0 items-center justify-center rounded-full border-[0.5px] border-[var(--color-lj-ink)]`}
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
        className={`${cell} w-5 text-center leading-[1.5] font-lj-mono tabular-nums text-[var(--color-lj-ink)]`}
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
