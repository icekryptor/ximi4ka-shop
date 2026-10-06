import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductForm } from './ProductForm'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import type { AdminProductInput } from '@/lib/adminApi'

function category(id: string, name: string, parentId: string | null = null): ProductCategory {
  return {
    id,
    slug: id,
    name,
    parentId,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
  }
}

const CATEGORIES = [category('c-kits', 'Наборы'), category('c-minerals', 'Минералы', 'c-kits')]

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'kit',
    sku: null,
    name: 'Kit',
    shortDescription: null,
    longDescriptionBlocks: [],
    priceRub: 100,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    isPublished: false,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('ProductForm', () => {
  it('renders all sections', () => {
    render(<ProductForm mode="create" onSubmit={async () => undefined} submitting={false} />)
    expect(screen.getByText('Основные')).toBeInTheDocument()
    expect(screen.getByText('Медиа')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
    expect(screen.getByText('Описание (блоки)')).toBeInTheDocument()
  })

  it('shows slug error for invalid characters', async () => {
    const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
    render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'Invalid Slug!' },
    })
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'X' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(screen.getByText('Недопустимый slug')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits valid input', async () => {
    const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
    render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'ok-kit' },
    })
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'OK Kit' },
    })
    fireEvent.change(screen.getByLabelText('Цена, ₽'), {
      target: { value: '500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      slug: 'ok-kit',
      name: 'OK Kit',
      priceRub: 500,
    })
  })

  it('surfaces 409 slug_conflict error', () => {
    const apiErr = {
      status: 409,
      code: 'slug_conflict',
      message: 'dup',
      name: 'ApiError',
    }
    render(
      <ProductForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(screen.getByText(/Товар с таким slug уже существует/i)).toBeInTheDocument()
  })

  describe('categories', () => {
    it('lists categories as checkboxes and submits the selected ids', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="create"
          onSubmit={onSubmit}
          submitting={false}
          allCategories={CATEGORIES}
        />,
      )
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'k' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'K' } })
      fireEvent.click(screen.getByLabelText('Наборы'))
      fireEvent.click(screen.getByLabelText(/Минералы/))
      fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].categoryIds?.sort()).toEqual(['c-kits', 'c-minerals'])
    })

    it('pre-checks the product categories in edit mode and can clear them', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={product({ categoryIds: ['c-kits'] })}
          onSubmit={onSubmit}
          submitting={false}
          allCategories={CATEGORIES}
        />,
      )
      const kits = screen.getByLabelText('Наборы') as HTMLInputElement
      expect(kits.checked).toBe(true)
      expect((screen.getByLabelText(/Минералы/) as HTMLInputElement).checked).toBe(false)
      fireEvent.click(kits)
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].categoryIds).toEqual([])
    })

    it('does not send categoryIds when the editing product does not carry them', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={product()}
          onSubmit={onSubmit}
          submitting={false}
          allCategories={CATEGORIES}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('categoryIds')
    })

    it('keeps ids of categories that are missing from the list', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={product({ categoryIds: ['c-hidden'] })}
          onSubmit={onSubmit}
          submitting={false}
          allCategories={CATEGORIES}
        />,
      )
      fireEvent.click(screen.getByLabelText('Наборы'))
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].categoryIds?.sort()).toEqual(['c-hidden', 'c-kits'])
    })
  })

  describe('shipping', () => {
    it('submits weight, boxes, loose units and min box', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'k' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'K' } })
      fireEvent.change(screen.getByLabelText('Вес, г'), { target: { value: '250' } })
      fireEvent.change(screen.getByLabelText('Малая коробка, шт'), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText('Средняя коробка, шт'), { target: { value: '2' } })
      fireEvent.change(screen.getByLabelText('Предметов мелочи в штуке'), {
        target: { value: '3' },
      })
      fireEvent.change(screen.getByLabelText('Минимальная коробка для мелочи'), {
        target: { value: 'medium' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        weightG: 250,
        shipBoxes: ['small', 'medium', 'medium'],
        looseUnits: 3,
        minBox: 'medium',
      })
    })

    it('defaults to no weight, no boxes, one loose unit and no min box', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'k' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'K' } })
      fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        weightG: null,
        shipBoxes: [],
        looseUnits: 1,
        minBox: null,
      })
    })

    it('prefills from the product and clears the weight with an empty field', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={product({
            weightG: 400,
            shipBoxes: ['elektro'],
            looseUnits: 2,
            minBox: 'large',
          })}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      expect((screen.getByLabelText('Вес, г') as HTMLInputElement).value).toBe('400')
      expect((screen.getByLabelText('Коробка Электро, шт') as HTMLInputElement).value).toBe('1')
      expect((screen.getByLabelText('Малая коробка, шт') as HTMLInputElement).value).toBe('0')
      expect(
        (screen.getByLabelText('Минимальная коробка для мелочи') as HTMLSelectElement).value,
      ).toBe('large')
      fireEvent.change(screen.getByLabelText('Вес, г'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        weightG: null,
        shipBoxes: ['elektro'],
        looseUnits: 2,
        minBox: 'large',
      })
    })

    it('keeps the stored box order when the counts are untouched', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={product({ shipBoxes: ['medium', 'small', 'medium'] })}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].shipBoxes).toEqual(['medium', 'small', 'medium'])
    })

    it.each([
      ['Вес, г', '0'],
      ['Вес, г', '50001'],
      ['Предметов мелочи в штуке', '0'],
      ['Малая коробка, шт', '11'],
    ])('blocks submit when %s = %s', async (label, value) => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'k' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'K' } })
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
      // Submit the form directly: the browser's own min/max check would stop a
      // button click before the form's own validation runs.
      fireEvent.submit(screen.getByRole('form'))
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('blocks submit when all boxes together exceed 10', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'k' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'K' } })
      fireEvent.change(screen.getByLabelText('Малая коробка, шт'), { target: { value: '6' } })
      fireEvent.change(screen.getByLabelText('Средняя коробка, шт'), { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})
