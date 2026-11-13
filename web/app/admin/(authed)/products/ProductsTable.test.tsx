import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Product } from '@ximi4ka-shop/shared'
import { ProductsTable } from './ProductsTable'
import { parseIntegerInput } from './inlineInput'

const api = vi.hoisted(() => ({
  adminUpdateProduct: vi.fn(),
  adminPublishProduct: vi.fn(),
  adminUnpublishProduct: vi.fn(),
  adminDeleteProduct: vi.fn(),
}))

vi.mock('@/lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminApi')>()
  return { ...actual, ...api }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const product = {
  id: 'p-1',
  slug: 'kit',
  sku: 'KIT-1',
  name: 'Набор',
  priceRub: 1000,
  compareAtPriceRub: 1500,
  stockStatus: 'in_stock',
  sortOrder: 3,
  isPublished: true,
} as Product

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.adminUpdateProduct.mockImplementation(async (_id: string, input: Partial<Product>) => ({
    ...product,
    ...input,
  }))
})
afterEach(cleanup)

function priceInput() {
  return screen.getByLabelText('Цена «Набор»') as HTMLInputElement
}

function edit(input: HTMLInputElement, value: string, key: 'Enter' | 'Escape' = 'Enter') {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key })
  fireEvent.blur(input)
}

describe('parseIntegerInput', () => {
  it('принимает пробелы-разделители разрядов', () => {
    expect(parseIntegerInput('1 200')).toBe(1200)
    expect(parseIntegerInput('1 200')).toBe(1200)
  })
  it('пустое значение — null только для необязательных полей', () => {
    expect(parseIntegerInput('', { nullable: true })).toBeNull()
    expect(parseIntegerInput('')).toBe('invalid')
  })
  it('отклоняет дроби, мусор и значения ниже минимума', () => {
    expect(parseIntegerInput('1.5')).toBe('invalid')
    expect(parseIntegerInput('abc')).toBe('invalid')
    expect(parseIntegerInput('-5', { min: 0 })).toBe('invalid')
    expect(parseIntegerInput('-5')).toBe(-5)
  })
})

describe('ProductsTable', () => {
  it('Enter сохраняет цену PATCH-ем ровно одного поля', async () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(priceInput(), '1 290')
    await waitFor(() => expect(api.adminUpdateProduct).toHaveBeenCalledTimes(1))
    expect(api.adminUpdateProduct).toHaveBeenCalledWith('p-1', { priceRub: 1290 })
    expect(await screen.findByText('Сохранено')).toBeInTheDocument()
    expect(priceInput().value).toBe('1290')
  })

  it('Esc отменяет правку без запроса', () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(priceInput(), '999', 'Escape')
    expect(api.adminUpdateProduct).not.toHaveBeenCalled()
    expect(priceInput().value).toBe('1000')
  })

  it('значение не изменилось — запроса нет', () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(priceInput(), '1000')
    expect(api.adminUpdateProduct).not.toHaveBeenCalled()
  })

  it('некорректный ввод — ошибка в строке, без запроса, значение откатывается', () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(priceInput(), '12.5')
    expect(api.adminUpdateProduct).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Цена — целое число')
    expect(priceInput().value).toBe('1000')
  })

  it('пустая старая цена уходит как null', async () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(screen.getByLabelText('Старая цена «Набор»') as HTMLInputElement, '')
    await waitFor(() =>
      expect(api.adminUpdateProduct).toHaveBeenCalledWith('p-1', { compareAtPriceRub: null }),
    )
  })

  it('ошибка API — сообщение и прежнее значение', async () => {
    const { ApiError } = await import('@/lib/adminApi')
    api.adminUpdateProduct.mockRejectedValueOnce(new ApiError(400, 'validation_error', 'плохо'))
    render(<ProductsTable products={[product]} emptyText="" />)
    edit(priceInput(), '5')
    expect(await screen.findByRole('alert')).toHaveTextContent('Не сохранено: плохо')
    expect(priceInput().value).toBe('1000')
  })

  it('наличие меняется сразу из списка', async () => {
    render(<ProductsTable products={[product]} emptyText="" />)
    fireEvent.change(screen.getByLabelText('Наличие «Набор»'), {
      target: { value: 'preorder' },
    })
    await waitFor(() =>
      expect(api.adminUpdateProduct).toHaveBeenCalledWith('p-1', { stockStatus: 'preorder' }),
    )
  })

  it('снятие галочки «Опубликован» снимает товар с публикации', async () => {
    api.adminUnpublishProduct.mockResolvedValue({ ...product, isPublished: false })
    render(<ProductsTable products={[product]} emptyText="" />)
    fireEvent.click(screen.getByLabelText('Опубликован «Набор»'))
    await waitFor(() => expect(api.adminUnpublishProduct).toHaveBeenCalledWith('p-1'))
    expect(await screen.findByText('Черновик')).toBeInTheDocument()
  })

  it('пустой список показывает переданный текст', () => {
    render(<ProductsTable products={[]} emptyText="В этой категории товаров нет." />)
    expect(screen.getByText('В этой категории товаров нет.')).toBeInTheDocument()
  })
})
