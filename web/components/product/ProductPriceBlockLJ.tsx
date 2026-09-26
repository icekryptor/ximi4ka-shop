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
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[var(--color-lj-ink)]">
        <span className="font-lj-mazzard font-light text-4xl leading-none">
          {formatRub(priceRub)}
        </span>
        <span className="font-lj-mono text-base leading-6 opacity-70">₽</span>
      </span>
      {showCompare && (
        <span className="font-lj-mono text-sm text-[var(--color-lj-ink)] opacity-60 line-through whitespace-nowrap">
          {formatRub(compareAtPriceRub!)}
        </span>
      )}
      {discount != null && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full font-lj-mazzard font-bold text-sm leading-[16.5px] whitespace-nowrap bg-[var(--color-lj-brand)] text-[var(--color-lj-bone)]">
          −{discount}%
        </span>
      )}
    </div>
  )
}
