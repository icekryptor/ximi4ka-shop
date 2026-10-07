import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const getPublishedProduct = vi.fn()
vi.mock('./api', () => ({ getPublishedProduct: (slug: string) => getPublishedProduct(slug) }))

import { backfillCartCategories, loadCart, saveCart, type CartItem } from './cart'

const item = (slug: string, extra: Partial<CartItem> = {}): CartItem => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub: 100,
  quantity: 5,
  ...extra,
})

beforeEach(() => {
  window.localStorage.clear()
  getPublishedProduct.mockReset()
})
afterEach(() => {
  window.localStorage.clear()
})

describe('backfillCartCategories', () => {
  it('fetches categories for items that lack them and saves them in the cart', async () => {
    saveCart([item('sulfate'), item('soda', { categories: ['reagents'] })])
    getPublishedProduct.mockResolvedValue({ categorySlugs: ['reagents'] })

    await backfillCartCategories()

    expect(getPublishedProduct).toHaveBeenCalledTimes(1)
    expect(getPublishedProduct).toHaveBeenCalledWith('sulfate')
    expect(loadCart().find((i) => i.slug === 'sulfate')?.categories).toEqual(['reagents'])
  })

  it('does not request the same slug twice', async () => {
    saveCart([item('once')])
    getPublishedProduct.mockResolvedValue({ categorySlugs: [] })

    await Promise.all([backfillCartCategories(), backfillCartCategories()])

    expect(getPublishedProduct).toHaveBeenCalledTimes(1)
  })

  it('survives a failed request and keeps the item as is', async () => {
    saveCart([item('broken')])
    getPublishedProduct.mockRejectedValue(new Error('offline'))

    await expect(backfillCartCategories()).resolves.toBeUndefined()

    expect(loadCart()[0].categories).toBeUndefined()
  })
})
