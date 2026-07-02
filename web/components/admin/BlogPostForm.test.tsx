import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { BlogPostForm } from './BlogPostForm'
import type { AdminBlogPostInput } from '@/lib/adminApi'

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'b1',
    slug: 'post',
    title: 'Пост',
    excerpt: null,
    coverImageUrl: null,
    rubric: null,
    blocks: [],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: false,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('BlogPostForm', () => {
  it('renders all sections + editorial fields + block editor', () => {
    render(
      <BlogPostForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    expect(screen.getByText('Основные')).toBeInTheDocument()
    expect(screen.getByText('Блоки')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
    expect(screen.getByLabelText('Анонс')).toBeInTheDocument()
    expect(screen.getByLabelText('Рубрика')).toBeInTheDocument()
    expect(screen.getByLabelText('Обложка')).toBeInTheDocument()
    // Block editor's "Add block" control is rendered inside the Блоки section.
    expect(
      screen.getByRole('button', { name: /добавить блок/i }),
    ).toBeInTheDocument()
  })

  it('live-transliterates title into slug until slug is edited manually', () => {
    render(
      <BlogPostForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'Химия дома' },
    })
    expect(screen.getByLabelText('Slug')).toHaveValue('himiya-doma')

    // Manual slug edit detaches the live link.
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'custom-slug' },
    })
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'Другой заголовок' },
    })
    expect(screen.getByLabelText('Slug')).toHaveValue('custom-slug')
  })

  it('does not auto-rewrite slug in edit mode', () => {
    render(
      <BlogPostForm
        mode="edit"
        initialValue={makePost()}
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'Совсем новый заголовок' },
    })
    expect(screen.getByLabelText('Slug')).toHaveValue('post')
  })

  it('shows "Недопустимый slug" on invalid slug', async () => {
    const onSubmit = vi.fn<(input: AdminBlogPostInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <BlogPostForm
        mode="create"
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'Bad Slug!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(screen.getByText('Недопустимый slug')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with merged payload on valid form', async () => {
    const onSubmit = vi.fn<(input: AdminBlogPostInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <BlogPostForm
        mode="create"
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'Химия дома' },
    })
    fireEvent.change(screen.getByLabelText('Анонс'), {
      target: { value: 'Пять опытов на кухне' },
    })
    fireEvent.change(screen.getByLabelText('Рубрика'), {
      target: { value: 'Эксперименты' },
    })
    fireEvent.change(screen.getByLabelText('Meta title'), {
      target: { value: 'Химия дома — Ximi4ka' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      slug: 'himiya-doma',
      title: 'Химия дома',
      excerpt: 'Пять опытов на кухне',
      rubric: 'Эксперименты',
      metaTitle: 'Химия дома — Ximi4ka',
      coverImageUrl: null,
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
      <BlogPostForm
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
      <BlogPostForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(
      screen.getByText(/Статья с таким slug уже существует/i),
    ).toBeInTheDocument()
  })
})
