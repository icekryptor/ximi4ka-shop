import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { CompactProductRow } from './CompactProductRow'
import { loadCart } from '@/lib/cart'
import type { Product } from '@ximi4ka-shop/shared'

beforeEach(() => window.localStorage.clear())
afterEach(() => cleanup())

const base = {
  id: 'r1',
  slug: 'sulfat-alyuminiya',
  sku: 'AL2SO43',
  name: 'Сульфат алюминия 5%, 35 мл',
  shortDescription: 'реактив',
  priceRub: 69,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  longDescriptionBlocks: [],
} as unknown as Product

const images = [{ id: 'i1', productId: 'r1', url: '/r.png', alt: 'реактив', sortOrder: 0 }]

describe('CompactProductRow', () => {
  it('renders the name linking to the product, the formula chip and the price', () => {
    const { container } = render(<CompactProductRow product={base} images={images} />)
    const link = within(container).getByRole('link', { name: 'Сульфат алюминия 5%, 35 мл' })
    expect(link).toHaveAttribute('href', '/product/sulfat-alyuminiya')
    expect(within(container).getByText('Al₂(SO₄)₃')).toBeInTheDocument()
    expect(within(container).getByText('69')).toBeInTheDocument()
  })

  it('omits the chip when the formula is unknown', () => {
    const { container } = render(
      <CompactProductRow product={{ ...base, slug: 'probirka' } as Product} images={images} />,
    )
    expect(container.querySelector('[data-formula]')).toBeNull()
  })

  it('adds the selected quantity to the cart', () => {
    const { container } = render(<CompactProductRow product={base} images={images} />)
    act(() => {
      fireEvent.click(within(container).getByRole('button', { name: 'Увеличить количество' }))
    })
    act(() => {
      fireEvent.click(within(container).getByRole('button', { name: /В корзину/ }))
    })
    const cart = loadCart()
    expect(cart[0]?.productId).toBe('r1')
    expect(cart[0]?.quantity).toBe(2)
  })

  it('shows «Нет в наличии» instead of the stepper for out-of-stock products', () => {
    const { container } = render(
      <CompactProductRow
        product={{ ...base, stockStatus: 'out_of_stock' } as Product}
        images={images}
      />,
    )
    expect(within(container).queryByRole('group', { name: /Количество/ })).toBeNull()
    expect(within(container).getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('is a size container so the cart button renders as the 40px icon', () => {
    const { container } = render(<CompactProductRow product={base} images={images} />)
    expect(container.querySelector('[data-density="row"]')).toHaveClass('@container')
  })
})
