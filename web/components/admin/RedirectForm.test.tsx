import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RedirectForm } from './RedirectForm'
import type { AdminRedirectInput } from '@/lib/adminApi'

describe('RedirectForm', () => {
  it('renders the three core fields', () => {
    render(
      <RedirectForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    expect(screen.getByLabelText(/Исходный путь/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Целевой путь/)).toBeInTheDocument()
    expect(screen.getByLabelText(/HTTP-статус/)).toBeInTheDocument()
  })

  it('rejects from_path that does not start with /', async () => {
    const onSubmit = vi.fn<(i: AdminRedirectInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <RedirectForm mode="create" onSubmit={onSubmit} submitting={false} />,
    )
    fireEvent.change(screen.getByLabelText(/Исходный путь/), {
      target: { value: 'no-slash' },
    })
    fireEvent.change(screen.getByLabelText(/Целевой путь/), {
      target: { value: '/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Исходный путь должен начинаться с \//,
      )
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects reserved /admin prefix for from_path', async () => {
    const onSubmit = vi.fn<(i: AdminRedirectInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <RedirectForm mode="create" onSubmit={onSubmit} submitting={false} />,
    )
    fireEvent.change(screen.getByLabelText(/Исходный путь/), {
      target: { value: '/admin/dashboard' },
    })
    fireEvent.change(screen.getByLabelText(/Целевой путь/), {
      target: { value: '/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /не может начинаться с \/admin/i,
      )
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with trimmed values on valid input', async () => {
    const onSubmit = vi.fn<(i: AdminRedirectInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <RedirectForm mode="create" onSubmit={onSubmit} submitting={false} />,
    )
    fireEvent.change(screen.getByLabelText(/Исходный путь/), {
      target: { value: '  /old  ' },
    })
    fireEvent.change(screen.getByLabelText(/Целевой путь/), {
      target: { value: '/new' },
    })
    fireEvent.change(screen.getByLabelText(/HTTP-статус/), {
      target: { value: '302' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0][0]).toEqual({
      fromPath: '/old',
      toPath: '/new',
      statusCode: 302,
    })
  })

  it('accepts absolute http(s) URL as to_path', async () => {
    const onSubmit = vi.fn<(i: AdminRedirectInput) => Promise<void>>(
      async () => undefined,
    )
    render(
      <RedirectForm mode="create" onSubmit={onSubmit} submitting={false} />,
    )
    fireEvent.change(screen.getByLabelText(/Исходный путь/), {
      target: { value: '/old' },
    })
    fireEvent.change(screen.getByLabelText(/Целевой путь/), {
      target: { value: 'https://example.com/page' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].toPath).toBe('https://example.com/page')
  })

  it('surfaces 409 from_path_conflict inline', () => {
    const apiErr = {
      status: 409,
      code: 'from_path_conflict',
      message: 'dup',
      name: 'ApiError',
    }
    render(
      <RedirectForm
        mode="create"
        onSubmit={async () => undefined}
        submitting={false}
        error={apiErr as never}
      />,
    )
    expect(
      screen.getByText(/Редирект с таким исходным путём уже существует/i),
    ).toBeInTheDocument()
  })

  it('shows hit count in edit mode', () => {
    render(
      <RedirectForm
        mode="edit"
        initialValue={{
          id: 'abc',
          fromPath: '/a',
          toPath: '/b',
          statusCode: 301,
          hitCount: 42,
        }}
        onSubmit={async () => undefined}
        submitting={false}
      />,
    )
    expect(screen.getByText(/Хиты:/)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
