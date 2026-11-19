import { formatRub } from '@/lib/stockLabel'
import { WB_PRICES, formatAsOf, wbComparison, type WbPrice } from '@/lib/wbPrices'

interface Props {
  slug: string
  priceRub: number
  /** текущее время — подменяется в тестах */
  now?: Date
  /** таблица цен WB — подменяется в тестах */
  prices?: Readonly<Record<string, WbPrice>>
  className?: string
}

/**
 * Сравнение с Wildberries: зачёркнутая цена покупателя на WB и выгода у нас.
 * Строка того же кегля, что и чип Сплита, — стоит под ценой в карточке и на
 * странице товара. Нет цены WB, она устарела или у нас не дешевле — ничего
 * не рисует (lib/wbPrices.ts).
 */
export function WbPriceCompare({ slug, priceRub, now, prices = WB_PRICES, className = '' }: Props) {
  const cmp = wbComparison(slug, priceRub, now, prices)
  if (!cmp) return null
  return (
    <p
      data-testid="wb-price-compare"
      title={
        cmp.sumOfParts
          ? `Сумма цен входящих наборов на Wildberries при покупке по отдельности, с учётом скидки СПП, по данным на ${formatAsOf(cmp.asOf)}`
          : `Цена покупателя на Wildberries с учётом скидки СПП, по данным на ${formatAsOf(cmp.asOf)}`
      }
      className={`inline-flex w-fit flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] border border-[#cb11ab]/25 bg-[#cb11ab]/[0.06] px-2.5 py-1.5 font-ys-text text-[0.8125rem] leading-[18px] text-black/85 ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-flex h-[18px] items-center rounded-full bg-[#cb11ab] px-1.5 text-[0.6875rem] font-bold tracking-[0.02em] text-white"
        >
          WB
        </span>
        <span>
          {cmp.sumOfParts ? 'на Wildberries по отдельности' : 'на Wildberries'}{' '}
          <s className="whitespace-nowrap opacity-70">
            <span className="sr-only">было </span>
            {formatRub(cmp.wbPriceRub)}
          </s>
        </span>
      </span>
      <span className="whitespace-nowrap font-bold text-[#cb11ab]">
        у нас дешевле на {formatRub(cmp.savingRub)} (−{cmp.savingPct}%)
      </span>
    </p>
  )
}
