import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { CompactProductCard } from './CompactProductCard'
import { loadCart } from '@/lib/cart'
import type { Product } from '@ximi4ka-shop/shared'

beforeEach(() => window.localStorage.clear())
afterEach(() => cleanup())

const base = {
  id: 'r1',
  slug: 'sulfat-medi',
  sku: 'R-11',
  name: 'Сульфат меди (II) 100 г',
  shortDescription: 'реактив',
  priceRub: 290,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  longDescriptionBlocks: [],
} as unknown as Product

const images = [
  { id: 'i1', productId: 'r1', url: '/r.png', alt: 'реактив', sortOrder: 0 },
]

describe('CompactProductCard', () => {
  it('renders name, sku and price', () => {
    const { container } = render(
      <CompactProductCard product={base} images={images} />,
    )
    expect(within(container).getByText('Сульфат меди (II) 100 г')).toBeInTheDocument()
    expect(within(container).getByText(/№ R-11/)).toBeInTheDocument()
    expect(within(container).getByText(/290/)).toBeInTheDocument()
  })

  it('renders a quantity stepper and add-to-cart button', () => {
    const { container } = render(
      <CompactProductCard product={base} images={images} />,
    )
    expect(within(container).getByRole('group', { name: /Количество/ })).toBeInTheDocument()
    expect(
      within(container).getByRole('button', { name: /В корзину/ }),
    ).toBeInTheDocument()
  })

  it('adds the selected quantity to the cart', () => {
    const { container } = render(
      <CompactProductCard product={base} images={images} />,
    )
    // bump quantity to 3
    const inc = within(container).getByRole('button', { name: 'Увеличить количество' })
    act(() => {
      fireEvent.click(inc)
    })
    act(() => {
      fireEvent.click(inc)
    })
    act(() => {
      fireEvent.click(within(container).getByRole('button', { name: /В корзину/ }))
    })
    const cart = loadCart()
    expect(cart).toHaveLength(1)
    expect(cart[0]?.quantity).toBe(3)
    expect(cart[0]?.productId).toBe('r1')
  })

  it('hides the stepper and shows out-of-stock label for out_of_stock products', () => {
    const { container } = render(
      <CompactProductCard
        product={{ ...base, stockStatus: 'out_of_stock' } as Product}
        images={images}
      />,
    )
    expect(within(container).queryByRole('group', { name: /Количество/ })).toBeNull()
    expect(within(container).getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('renders a SpecimenCard placeholder when no images are provided', () => {
    const { container } = render(
      <CompactProductCard product={base} images={[]} />,
    )
    expect(within(container).getByText('ОБРАЗЕЦ № R-11')).toBeInTheDocument()
  })
})
