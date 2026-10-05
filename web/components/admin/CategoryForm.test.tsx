import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CategoryForm } from './CategoryForm'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { AdminCategoryInput } from '@/lib/adminApi'

function cat(id: string, name: string, parentId: string | null, sortOrder = 0): ProductCategory {
  return {
    id,
    slug: id,
    name,
    parentId,
    metaTitle: null,
    metaDescription: null,
    sortOrder,
    translations: {},
  }
}

describe('CategoryForm', () => {
  it('renders both sections', () => {
    render(
      <CategoryForm
        mode="create"
        allCategories={[]}
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    expect(screen.getByText('Основные')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
  })

  it('shows slug validation error and blocks submit', async () => {
    const onSubmit = vi.fn<(input: AdminCategoryInput) => Promise<void>>(async () => undefined)
    render(<CategoryForm mode="create" allCategories={[]} onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'Bad Slug!' },
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

  it('submits full payload with parentId and SEO fields', async () => {
    const onSubmit = vi.fn<(input: AdminCategoryInput) => Promise<void>>(async () => undefined)
    render(
      <CategoryForm
        mode="create"
        allCategories={[cat('root', 'Root', null)]}
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'child-cat' },
    })
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Child' },
    })
    fireEvent.change(screen.getByLabelText('Родительская категория'), {
      target: { value: 'root' },
    })
    fireEvent.change(screen.getByLabelText('Сортировка'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Meta title'), {
      target: { value: 'T' },
    })
    fireEvent.change(screen.getByLabelText('Meta description'), {
      target: { value: 'D' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      slug: 'child-cat',
      name: 'Child',
      parentId: 'root',
      sortOrder: 5,
      metaTitle: 'T',
      metaDescription: 'D',
    })
  })

  describe('SEO-текст категории (seoBlocks)', () => {
    const blocks = [
      { type: 'paragraph', html: '<h2>О категории</h2>' },
      { type: 'faq', items: [{ question: 'Вопрос?', answer: 'Ответ.' }] },
    ]

    async function submitEdit(initial: ProductCategory) {
      const onSubmit = vi.fn<(input: AdminCategoryInput) => Promise<void>>(async () => undefined)
      render(
        <CategoryForm
          mode="edit"
          initialValue={initial}
          allCategories={[initial]}
          onSubmit={onSubmit}
          submitting={false}
        />,
      )
      return onSubmit
    }

    it('показывает редактор блоков в отдельной секции, поле необязательное', () => {
      render(
        <CategoryForm
          mode="create"
          allCategories={[]}
          onSubmit={async () => undefined}
          submitting={false}
        />,
      )
      expect(screen.getByText('SEO-текст и FAQ')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /добавить блок/i })).toBeInTheDocument()
    })

    it('категория без текста отправляет seoBlocks: null', async () => {
      const onSubmit = await submitEdit(cat('a', 'A', null))
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].seoBlocks).toBeNull()
    })

    it('существующие блоки приходят в редактор и уходят обратно без изменений', async () => {
      const onSubmit = await submitEdit({ ...cat('a', 'A', null), seoBlocks: blocks })
      expect(screen.getAllByLabelText('Удалить блок')).toHaveLength(2)
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].seoBlocks).toEqual(blocks)
    })

    it('добавленный блок попадает в seoBlocks, а удаление всех блоков даёт null', async () => {
      const onSubmit = await submitEdit({ ...cat('a', 'A', null), seoBlocks: blocks })
      fireEvent.click(screen.getByRole('button', { name: /добавить блок/i }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Вопросы и ответы' }))
      expect(screen.getAllByLabelText('Удалить блок')).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].seoBlocks).toHaveLength(3)

      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getAllByLabelText('Удалить блок')[0])
      }
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
      expect(onSubmit.mock.calls[1][0].seoBlocks).toBeNull()
    })
  })

  it('excludes self and descendants from parent options in edit mode', () => {
    // Tree: r → a → a1; r → b. Editing "a" — options must exclude "a" and "a1".
    const all = [cat('r', 'R', null), cat('a', 'A', 'r'), cat('b', 'B', 'r'), cat('a1', 'A1', 'a')]
    render(
      <CategoryForm
        mode="edit"
        initialValue={all[1]}
        allCategories={all}
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    const select = screen.getByLabelText('Родительская категория') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('') // "без родителя"
    expect(optionValues).toContain('r')
    expect(optionValues).toContain('b')
    expect(optionValues).not.toContain('a')
    expect(optionValues).not.toContain('a1')
  })

  it('surfaces 409 slug_conflict inline next to slug field', () => {
    const apiErr = {
      status: 409,
      code: 'slug_conflict',
      message: 'dup',
      name: 'ApiError',
    }
    render(
      <CategoryForm
        mode="create"
        allCategories={[]}
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(screen.getByText(/Категория с таким slug уже существует/i)).toBeInTheDocument()
  })
})
