import type { CartTotals } from '@/lib/cart'
import { formatRub } from '@/lib/stockLabel'

interface Props {
  totals: CartTotals
  itemCount: number
}

const ROW =
  'flex justify-between gap-4 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]'

/**
 * Строки подытога — общие для выдвижной корзины, страницы корзины и
 * чекаута: «Товары» по ценам «до» и «Скидка» (разница с ценой «до» плюс
 * оптовая на наборы). Доставку и «Итого» рисует место вызова — у них
 * разные источники и оформление.
 */
export function CartSummaryRows({ totals, itemCount }: Props) {
  return (
    <>
      <div className={`${ROW} opacity-70`}>
        <span>Товары · {itemCount} шт</span>
        <span data-testid="summary-goods">{formatRub(totals.goodsRub)}</span>
      </div>
      {totals.discountRub > 0 && (
        <div className={`${ROW} text-[var(--color-lj-brand-deep)]`}>
          <span>
            Скидка
            {totals.wholesaleRub > 0 && (
              <span className="normal-case tracking-normal opacity-80">
                {' '}
                · в т. ч. оптовая {formatRub(totals.wholesaleRub)}
              </span>
            )}
          </span>
          <span data-testid="summary-discount" className="whitespace-nowrap">
            −{formatRub(totals.discountRub)}
          </span>
        </div>
      )}
    </>
  )
}
