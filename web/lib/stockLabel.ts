import type { Product } from '@ximi4ka-shop/shared'

export function stockLabel(status: Product['stockStatus']): string {
  switch (status) {
    case 'in_stock':
      return 'В наличии'
    case 'out_of_stock':
      return 'Нет в наличии'
    case 'preorder':
      return 'Предзаказ'
  }
}

export function formatRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}
