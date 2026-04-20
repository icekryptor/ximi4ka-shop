import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LoginPage from './page'

const mockReplace = vi.fn<(path: string) => void>()
const mockRefresh = vi.fn<() => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}))

beforeEach(() => {
  mockReplace.mockReset()
  mockRefresh.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LoginPage', () => {
  it('renders the Russian heading and form fields', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Вход в админку' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
  })

  it('submits credentials and redirects to /admin on success', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: 'u', email: 'a@b.c', role: 'admin' } }), {
        status: 200,
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [url, init] = call
    expect(url).toMatch(/\/api\/auth\/login$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.c', password: 'pw' })

    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin')
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('displays API error message on 401', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 'invalid_credentials', message: 'Неверные данные' } }),
        { status: 401 },
      ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Неверные данные')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('displays a fallback message when fetch throws', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Не удалось связаться с сервером')
  })
})
