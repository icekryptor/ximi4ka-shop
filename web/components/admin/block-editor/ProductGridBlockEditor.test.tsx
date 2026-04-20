import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ProductGridBlock } from '@ximi4ka-shop/shared'
import { ProductGridBlockEditor } from './ProductGridBlockEditor'

describe('ProductGridBlockEditor', () => {
  it('parses comma-separated slugs on blur', () => {
    const onChange = vi.fn<(b: ProductGridBlock) => void>()
    render(
      <ProductGridBlockEditor
        block={{ type: 'product_grid', productSlugs: [], heading: null }}
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText(/Slugs товаров/i)
    fireEvent.change(input, { target: { value: 'a-kit, b-kit,  c-kit ,' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.productSlugs).toEqual(['a-kit', 'b-kit', 'c-kit'])
  })

  it('updates heading', () => {
    const onChange = vi.fn<(b: ProductGridBlock) => void>()
    render(
      <ProductGridBlockEditor
        block={{ type: 'product_grid', productSlugs: [], heading: null }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'Популярное' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ heading: 'Популярное' }),
    )
  })

  it('does not fire onChange if committed value matches current', () => {
    const onChange = vi.fn<(b: ProductGridBlock) => void>()
    render(
      <ProductGridBlockEditor
        block={{
          type: 'product_grid',
          productSlugs: ['x', 'y'],
          heading: null,
        }}
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText(/Slugs товаров/i)
    // Initial raw value already matches; blur with no change shouldn't fire.
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })
})
