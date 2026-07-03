interface Props {
  priceRub: number
  compareAtPriceRub?: number | null
}

function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null
  return Math.round((1 - price / compareAt) * 100)
}

function formatRub(rub: number): string {
  return rub.toLocaleString('ru-RU').replace(/,/g, ' ')
}

export function ProductPriceBlockLJ({ priceRub, compareAtPriceRub }: Props) {
  const showCompare = compareAtPriceRub != null && compareAtPriceRub > priceRub
  const discount = discountPercent(priceRub, compareAtPriceRub)
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="font-lj-display font-[900] text-[clamp(2.5rem,4vw,3.5rem)] leading-none tracking-[-0.04em] text-[var(--color-lj-ink)]">
        {formatRub(priceRub)}
        <span className="font-lj-mono font-normal text-base ml-1.5 opacity-70">₽</span>
      </span>
      {showCompare && (
        <span className="font-lj-mono text-sm text-[var(--color-lj-ink)] opacity-60 line-through">
          {formatRub(compareAtPriceRub!)}
        </span>
      )}
      {discount != null && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full font-lj-mono text-[0.6875rem] uppercase tracking-[0.08em] bg-[var(--color-lj-brand)] text-[var(--color-lj-bone)]">
          −{discount}%
        </span>
      )}
    </div>
  )
}
