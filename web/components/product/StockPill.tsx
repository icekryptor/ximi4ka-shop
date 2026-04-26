import type { Product } from '@ximi4ka-shop/shared'
import { Pill } from '@/components/ui'
import { stockLabel } from '@/lib/stockLabel'

type Variant = 'success' | 'warning' | 'danger'

function stockVariant(status: Product['stockStatus']): Variant {
  switch (status) {
    case 'in_stock':
      return 'success'
    case 'preorder':
      return 'warning'
    case 'out_of_stock':
      return 'danger'
  }
}

interface Props {
  status: Product['stockStatus']
  className?: string
}

export function StockPill({ status, className = '' }: Props) {
  return (
    <Pill variant={stockVariant(status)} className={className}>
      {stockLabel(status)}
    </Pill>
  )
}
