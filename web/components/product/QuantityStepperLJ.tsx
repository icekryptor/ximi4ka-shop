'use client'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function QuantityStepperLJ({ value, onChange, min = 1, max = 99 }: Props) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  return (
    <div className="inline-flex items-center border border-[var(--color-lj-ink)] rounded-full overflow-hidden">
      <button
        type="button"
        onClick={dec}
        aria-label="decrease quantity"
        className="px-4 py-2 font-[var(--font-lj-mono)] text-base hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)] transition-colors"
      >
        −
      </button>
      <span className="px-4 py-2 font-[var(--font-lj-display)] font-[700] min-w-[3ch] text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        aria-label="increase quantity"
        className="px-4 py-2 font-[var(--font-lj-mono)] text-base hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)] transition-colors"
      >
        +
      </button>
    </div>
  )
}
