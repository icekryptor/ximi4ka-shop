import { hasBlackFridayChip } from '@/lib/blackFridayChip'

interface Props {
  slug: string
  className?: string
  /** текущее время — подменяется в тестах */
  now?: Date
}

/**
 * Чип «ЧП» — «Чёрная пятница» — на товаре со скидкой акции. Чёрное поле и
 * жёлтые буквы в гамме баннера акции: цвета берутся из его переменных
 * (--bf-black, --bf-yellow), запасные значения — те же. Вне дат показа и для
 * товаров не из списка ничего не рисует.
 */
export function BlackFridayChip({ slug, className = '', now }: Props) {
  if (!hasBlackFridayChip(slug, now)) return null
  return (
    <span
      data-testid="black-friday-chip"
      title="Чёрная пятница: скидка с 14 по 28 ноября"
      className={`inline-flex min-h-[28px] items-center rounded-[14px] border border-[var(--bf-yellow,#ffd000)] bg-[var(--bf-black,#050505)] px-2.5 font-lj-mazzard text-[0.9375rem] font-[700] leading-5 tracking-[0.06em] text-[var(--bf-yellow,#ffd000)] ${className}`}
    >
      <span aria-hidden="true">ЧП</span>
      <span className="sr-only">Чёрная пятница</span>
    </span>
  )
}
