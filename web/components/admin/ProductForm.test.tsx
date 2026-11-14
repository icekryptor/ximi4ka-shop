import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ProductForm } from './ProductForm'
import { adminListCategories, type AdminProductInput } from '@/lib/adminApi'

vi.mock('@/lib/adminApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adminApi')>()),
  adminListCategories: vi.fn(),
}))

function cat(id: string, name: string, parentId: string | null = null, sortOrder = 0) {
  return { id, slug: id, name, parentId, sortOrder, translations: {}, productCount: 0 }
}

const CATEGORIES = [
  cat('c-sub', 'Наборы ОГЭ', 'c-kits', 1),
  cat('c-kits', 'Наборы', null, 0),
  cat('c-reag', 'Реактивы', null, 1),
]

function listResult(data: unknown[]) {
  return { data, pagination: { limit: 200, offset: 0, total: data.length } } as never
}

beforeEach(() => {
  vi.mocked(adminListCategories).mockReset()
  vi.mocked(adminListCategories).mockResolvedValue(listResult(CATEGORIES))
})

const EDIT_PRODUCT = {
  id: 'p1',
  slug: 'oge',
  name: 'ОГЭ',
  priceRub: 100,
  stockStatus: 'in_stock',
  sortOrder: 0,
  longDescriptionBlocks: [],
  noindex: false,
  translations: {},
  images: [],
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

  it('отправляет флаг «Купить в 1 клик через Яндекс»', async () => {
    const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
    render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'ycp-kit' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Набор' } })
    const checkbox = screen.getByLabelText('Купить в 1 клик через Яндекс')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].ycpEnabled).toBe(true)
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

  describe('категории', () => {
    it('показывает дерево: подкатегория под родителем с отступом', async () => {
      render(<ProductForm mode="create" onSubmit={async () => undefined} submitting={false} />)
      const group = await screen.findByRole('group', { name: 'Категории товара' })
      const labels = within(group)
        .getAllByRole('checkbox')
        .map((cb) => cb.closest('label'))
      expect(labels.map((l) => l?.textContent)).toEqual(['Наборы', 'Наборы ОГЭ', 'Реактивы'])
      const indent = (l: HTMLElement | null | undefined) => parseFloat(l?.style.paddingLeft ?? '0')
      expect(indent(labels[1])).toBeGreaterThan(indent(labels[0]))
    })

    it('при создании отправляет отмеченные categoryIds', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'kit' } })
      fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Набор' } })
      fireEvent.click(await screen.findByRole('checkbox', { name: 'Наборы ОГЭ' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Реактивы' }))
      expect(screen.getByText('Выбрано: Наборы ОГЭ, Реактивы')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].categoryIds).toEqual(['c-sub', 'c-reag'])
    })

    it('при правке отмечает текущие категории, снятие всех отправляет []', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={{ ...EDIT_PRODUCT, categoryIds: ['c-kits'] } as never}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      const kits = await screen.findByRole('checkbox', { name: 'Наборы' })
      expect(kits).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Реактивы' })).not.toBeChecked()
      fireEvent.click(kits)
      expect(screen.getByText(/Категории не выбраны/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].categoryIds).toEqual([])
    })

    it('не отправляет categoryIds, если текущие связи товара неизвестны', async () => {
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={EDIT_PRODUCT as never}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      await screen.findByRole('group', { name: 'Категории товара' })
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('categoryIds')
    })

    it('список не загрузился — предупреждает и не трогает категории', async () => {
      vi.mocked(adminListCategories).mockRejectedValue(new Error('network'))
      const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
      render(
        <ProductForm
          mode="edit"
          initialValue={{ ...EDIT_PRODUCT, categoryIds: ['c-kits'] } as never}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      expect(await screen.findByText(/Не удалось загрузить категории/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('categoryIds')
    })
  })
})
