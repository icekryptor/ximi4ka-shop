import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { orderCategoriesAsTree, ProductsCategoryFilter } from './ProductsCategoryFilter'

const push = vi.fn()
let search = 'q=kit&offset=50'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}))

afterEach(() => {
  cleanup()
  push.mockReset()
})

const cat = (id: string, name: string, parentId: string | null, sortOrder = 0) =>
  ({ id, slug: id, name, parentId, sortOrder, productCount: 1 }) as ProductCategory

const categories = [
  cat('reag', 'Реактивы', null, 2),
  cat('kits', 'Наборы', null, 1),
  cat('oge', 'ОГЭ', 'kits'),
  cat('lost', 'Сирота', 'missing'),
]

describe('orderCategoriesAsTree', () => {
  it('корни по sortOrder, подкатегории сразу под родителем, сироты — в корне', () => {
    expect(orderCategoriesAsTree(categories).map((x) => [x.category.id, x.depth])).toEqual([
      ['lost', 0],
      ['kits', 0],
      ['oge', 1],
      ['reag', 0],
    ])
  })
})

describe('ProductsCategoryFilter', () => {
  it('выбор категории сохраняет поиск и сбрасывает страницу', () => {
    render(<ProductsCategoryFilter categories={categories} value="" />)
    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'oge' } })
    expect(push).toHaveBeenCalledWith('/admin/products?q=kit&category=oge')
  })

  it('«Все категории» убирает фильтр', () => {
    search = 'category=oge'
    render(<ProductsCategoryFilter categories={categories} value="oge" />)
    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: '' } })
    expect(push).toHaveBeenCalledWith('/admin/products')
  })
})
