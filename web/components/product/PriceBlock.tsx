import { formatRub } from '@/lib/stockLabel'
import { Pill } from '@/components/ui'

interface Props {
  priceRub: number
  compareAtPriceRub?: number | null
  size?: 'md' | 'lg'
  className?: string
}

function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null
  return Math.round((1 - price / compareAt) * 100)
}

const sizeClass: Record<'md' | 'lg', { main: string; compare: string }> = {
  md: {
    main: 'text-[length:var(--text-h3)]',
    compare: 'text-[length:var(--text-small)]',
  },
  lg: {
    main: 'text-[length:var(--text-h1)]',
    compare: 'text-[length:var(--text-body)]',
  },
}

export function PriceBlock({
  priceRub,
  compareAtPriceRub,
  size = 'md',
  className = '',
}: Props) {
  const showCompare =
    compareAtPriceRub != null && compareAtPriceRub > priceRub
  const discount = discountPercent(priceRub, compareAtPriceRub)
  const sz = sizeClass[size]

  return (
    <div className={`flex flex-wrap items-baseline gap-3 ${className}`}>
      <span
        data-price="main"
        className={`font-[var(--font-display)] tracking-[var(--tracking-tight)] text-[var(--color-brand-text)] ${sz.main}`}
      >
        {formatRub(priceRub)}
      </span>
      {showCompare && (
        <span
          data-price="compare"
          className={`text-[var(--color-text-muted)] line-through ${sz.compare}`}
        >
          {formatRub(compareAtPriceRub!)}
        </span>
      )}
      {discount != null && <Pill variant="solid-brand">−{discount}%</Pill>}
    </div>
  )
}
