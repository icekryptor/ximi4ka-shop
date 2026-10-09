import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductForm } from './ProductForm'
import type { AdminProductInput } from '@/lib/adminApi'

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

  it('отправляет галерею в поле images, а не в translations.gallery', async () => {
    const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
    const initialValue = {
      id: 'p1',
      slug: 'oge',
      name: 'ОГЭ',
      priceRub: 100,
      stockStatus: 'in_stock',
      sortOrder: 0,
      longDescriptionBlocks: [],
      noindex: false,
      translations: { gallery: [{ url: '/stale.jpg', alt: '' }] },
      images: [{ id: 'i1', productId: 'p1', url: '/uploads/a.webp', alt: 'А', sortOrder: 0 }],
    } as unknown as Parameters<typeof ProductForm>[0]['initialValue']
    render(
      <ProductForm
        mode="edit"
        initialValue={initialValue}
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const input = onSubmit.mock.calls[0][0]
    expect(input.images).toEqual([{ url: '/uploads/a.webp', alt: 'А' }])
    expect(input.translations?.gallery).toBeUndefined()
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

  // Chrome меняет значение сфокусированного <input type="number"> при прокрутке
  // колесом над ним: админ вводил 20, тянулся к «Сохранить» и сохранял 17.
  it.each(['Цена, ₽', 'Старая цена, ₽', 'Сортировка'])(
    'снимает фокус с числового поля «%s» при прокрутке колесом',
    (label) => {
      render(<ProductForm mode="create" onSubmit={async () => undefined} submitting={false} />)
      const input = screen.getByLabelText(label)
      input.focus()
      expect(input).toHaveFocus()
      fireEvent.wheel(input, { deltaY: 100 })
      expect(input).not.toHaveFocus()
    },
  )
})
