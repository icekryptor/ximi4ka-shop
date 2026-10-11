import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/adminApi'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const changePassword =
  vi.fn<(input: { currentPassword: string; newPassword: string }) => Promise<void>>()
vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return { ...actual, adminChangePassword: (input: never) => changePassword(input) }
})

import { ChangePasswordForm } from './ChangePasswordForm'

const GOOD = 'новый-надёжный-пароль'

function fill(current: string, next: string, repeat: string) {
  fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: repeat } })
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: /сменить пароль/i }))

describe('<ChangePasswordForm>', () => {
  beforeEach(() => {
    changePassword.mockReset()
    refresh.mockReset()
  })

  it('поля скрывают ввод и подсказывают браузеру, что где', () => {
    render(<ChangePasswordForm />)

    expect(screen.getByLabelText('Текущий пароль')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Текущий пароль')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Повторите новый пароль')).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
  })

  it.each([
    ['короче 12 знаков', 'old-password', 'короткий-1', 'короткий-1', /не короче 12/i],
    ['повтор не совпадает', 'old-password', GOOD, GOOD + 'x', /не совпада/i],
    ['новый равен текущему', GOOD, GOOD, GOOD, /совпадает с текущим/i],
    ['пустой текущий', '', GOOD, GOOD, /текущий пароль/i],
    [
      '6 эмодзи: длина считается символами, а не единицами UTF-16',
      'old-password',
      '😀'.repeat(6),
      '😀'.repeat(6),
      /не короче 12/i,
    ],
    ['длиннее 256 символов', 'old-password', 'a'.repeat(300), 'a'.repeat(300), /не длиннее 256/i],
  ])('%s: ошибка у формы, запрос не уходит', (_name, current, next, repeat, message) => {
    render(<ChangePasswordForm />)
    fill(current, next, repeat)

    submit()

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('успех: запрос с обоими паролями, сообщение, поля очищены, страница обновлена', async () => {
    changePassword.mockResolvedValue(undefined)
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/пароль изменён/i))
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: GOOD,
    })
    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('')
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('')
    expect(screen.getByLabelText('Повторите новый пароль')).toHaveValue('')
    expect(refresh).toHaveBeenCalled()
  })

  it('успех сообщает, что другие устройства будут разлогинены', async () => {
    changePassword.mockResolvedValue(undefined)
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/других устройствах/i))
  })

  it('ошибка сервера: его сообщение показано, поля не очищены, обновления нет', async () => {
    changePassword.mockRejectedValue(
      new ApiError(400, 'invalid_current_password', 'Текущий пароль указан неверно'),
    )
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Текущий пароль указан неверно'),
    )
    expect(screen.getByLabelText('Новый пароль')).toHaveValue(GOOD)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('12 разных эмодзи принимаются: запрос уходит', async () => {
    changePassword.mockResolvedValue(undefined)
    render(<ChangePasswordForm />)
    const emoji = '😀😁😂😃😄😅😆😇😈😉😊😋'
    fill('old-password', emoji, emoji)

    submit()

    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1))
  })

  it('401 (сессию отозвали на другом устройстве): просим войти заново, а не показываем английский текст', async () => {
    changePassword.mockRejectedValue(new ApiError(401, 'auth_required', 'Authentication required'))
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/войдите.*заново/i))
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Authentication/)
  })

  it.each([
    ['403 CSRF', new ApiError(403, 'csrf_failed', 'CSRF token invalid or missing')],
    ['400 validation_error', new ApiError(400, 'validation_error', 'Invalid request body')],
    ['500', new ApiError(500, 'internal_error', 'Internal Server Error')],
  ])('%s: общий русский текст вместо английского', async (_name, err) => {
    changePassword.mockRejectedValue(err)
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/не удалось сменить пароль/i),
    )
    expect(screen.getByRole('alert').textContent).not.toMatch(/[A-Za-z]{6,}/)
  })

  it('ошибка привязана к полям: aria-invalid, пока она показана', async () => {
    render(<ChangePasswordForm />)
    fill('old-password', 'коротко', 'коротко')

    submit()

    expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('aria-invalid', 'true')
  })

  it('429: понятное сообщение про лимит', async () => {
    changePassword.mockRejectedValue(new ApiError(429, 'rate_limited', 'Слишком много запросов'))
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/слишком много попыток/i),
    )
  })

  it('сбой сети: сообщение, а не белый экран', async () => {
    changePassword.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    submit()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/связаться с сервером/i),
    )
  })

  it('пока идёт запрос, кнопка заблокирована и повторный клик не шлёт второй запрос', async () => {
    let resolve!: () => void
    changePassword.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    render(<ChangePasswordForm />)
    fill('old-password', GOOD, GOOD)

    const button = screen.getByRole('button', { name: /сменить пароль/i })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(screen.getByRole('button', { name: /сохраняем/i })).toBeDisabled()
    expect(changePassword).toHaveBeenCalledTimes(1)
    resolve()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  })
})
