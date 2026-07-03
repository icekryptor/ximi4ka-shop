import type { StockStatus } from '@ximi4ka-shop/shared'

interface Props { status: StockStatus }

const CONFIG: Record<StockStatus, { label: string; dotClass: string }> = {
  in_stock:     { label: 'В наличии',      dotClass: 'bg-[var(--color-stock-success)]' },
  preorder:     { label: 'Под заказ',      dotClass: 'bg-[var(--color-stock-warning)]' },
  out_of_stock: { label: 'Нет в наличии',  dotClass: 'bg-[var(--color-stock-danger)]'  },
}

export function StockChip({ status }: Props) {
  const cfg = CONFIG[status]
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--color-lj-ink)] rounded-full font-lj-mono text-[0.6875rem] lowercase tracking-[0.04em] text-[var(--color-lj-ink)] bg-transparent">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  )
}
