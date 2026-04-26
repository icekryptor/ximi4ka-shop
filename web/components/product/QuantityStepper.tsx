'use client'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  className = '',
}: Props) {
  const decrement = () => {
    if (value > min) onChange(value - 1)
  }
  const increment = () => {
    if (value < max) onChange(value + 1)
  }
  const handleInput = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    if (n < min) return onChange(min)
    if (n > max) return onChange(max)
    onChange(Math.round(n))
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] ${className}`}
    >
      <button
        type="button"
        aria-label="Уменьшить количество"
        onClick={decrement}
        disabled={value <= min}
        className="flex h-10 w-10 items-center justify-center text-[length:var(--text-body)] text-[var(--color-brand-text)] hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        aria-label="Количество"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        min={min}
        max={max}
        className="w-12 bg-transparent text-center text-[length:var(--text-body)] font-medium text-[var(--color-brand-text)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="Увеличить количество"
        onClick={increment}
        disabled={value >= max}
        className="flex h-10 w-10 items-center justify-center text-[length:var(--text-body)] text-[var(--color-brand-text)] hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
