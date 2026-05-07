import { describe, it, expect } from 'vitest'
import { groupByPrimaryCategory, formatBacklogTable } from './audit-images.js'

describe('audit-images helpers', () => {
  it('groups products by primary (first) category name', () => {
    const products = [
      { id: 'p1', sku: 'A', slug: 'a', name: 'A', categories: [{ name: 'Реактивы' }] },
      { id: 'p2', sku: 'B', slug: 'b', name: 'B', categories: [{ name: 'Посуда' }] },
      { id: 'p3', sku: 'C', slug: 'c', name: 'C', categories: [{ name: 'Реактивы' }] },
      { id: 'p4', sku: null, slug: 'd', name: 'D', categories: [] },
    ] as any
    const grouped = groupByPrimaryCategory(products)
    expect(grouped.get('Реактивы')).toHaveLength(2)
    expect(grouped.get('Посуда')).toHaveLength(1)
    expect(grouped.get('Без категории')).toHaveLength(1)
  })

  it('formats markdown table with admin URLs', () => {
    const products = [
      { id: 'p1', sku: 'X-30', slug: 'himichka-30', name: 'Химичка 3.0' },
    ] as any
    const md = formatBacklogTable(products)
    expect(md).toContain('| X-30 |')
    expect(md).toContain('`himichka-30`')
    expect(md).toContain('Химичка 3.0')
    expect(md).toContain('/admin/products/p1')
  })
})
