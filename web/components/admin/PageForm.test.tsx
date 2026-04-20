import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PageForm } from './PageForm'
import type { AdminPageInput } from '@/lib/adminApi'

describe('PageForm', () => {
  it('renders all sections + block editor', () => {
    render(
      <PageForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    expect(screen.getByText('Основные')).toBeInTheDocument()
    expect(screen.getByText('Блоки')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
    // Block editor's "Add block" control is rendered inside the Блоки section.
    expect(
      screen.getByRole('button', { name: /добавить блок/i }),
    ).toBeInTheDocument()
  })

  it('shows "Недопустимый slug" on invalid slug', async () => {
    const onSubmit = vi.fn<(input: AdminPageInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <PageForm
        mode="create"
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'Bad Slug!' },
    })
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'X' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(screen.getByText('Недопустимый slug')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with merged payload on valid form', async () => {
    const onSubmit = vi.fn<(input: AdminPageInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <PageForm
        mode="create"
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'o-nas' },
    })
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'О нас' },
    })
    fireEvent.change(screen.getByLabelText('Meta title'), {
      target: { value: 'О нас — Ximi4ka' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      slug: 'o-nas',
      title: 'О нас',
      metaTitle: 'О нас — Ximi4ka',
      noindex: false,
      blocks: [],
    })
  })

  it('renders server error envelope when error prop is set', () => {
    const apiErr = {
      status: 500,
      code: 'internal_error',
      message: 'boom',
      name: 'ApiError',
    }
    render(
      <PageForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('surfaces 409 slug_conflict inline above submit', () => {
    const apiErr = {
      status: 409,
      code: 'slug_conflict',
      message: 'dup',
      name: 'ApiError',
    }
    render(
      <PageForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(
      screen.getByText(/Страница с таким slug уже существует/i),
    ).toBeInTheDocument()
  })
})
