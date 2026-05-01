'use client'

interface Props {
  priceRub: number
  onAddToCart: () => void
  disabled: boolean
}

function formatRub(rub: number): string {
  return rub.toLocaleString('ru-RU').replace(/,/g, ' ')
}

export function MobileBuyBarLJ({ priceRub, onAddToCart, disabled }: Props) {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--color-lj-ink)] border-t border-[var(--color-lj-rule-on-ink)] px-4 py-3 flex items-center justify-between gap-3">
      <span className="font-[var(--font-lj-display)] font-[900] text-2xl tracking-[-0.04em] text-[var(--color-lj-bone)]">
        {formatRub(priceRub)}
        <span className="font-[var(--font-lj-mono)] font-normal text-sm ml-1 opacity-70">₽</span>
      </span>
      <button
        type="button"
        onClick={onAddToCart}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-5 py-3 font-[var(--font-lj-mono)] text-[0.75rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-bone)] rounded-full bg-transparent text-[var(--color-lj-bone)] transition-all duration-400 hover:bg-[var(--color-lj-bone)] hover:text-[var(--color-lj-ink)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        В корзину →
      </button>
    </div>
  )
}
