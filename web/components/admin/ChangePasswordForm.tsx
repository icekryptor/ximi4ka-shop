'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminChangePassword, ApiError } from '@/lib/adminApi'

// Те же границы, что на сервере (api/src/routes/auth/constants.ts): здесь
// проверяем заранее, чтобы не гонять запрос ради очевидной ошибки.
const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 256

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-brand-border focus:outline-none focus:border-brand'

// Длина в символах, а не в единицах UTF-16: шесть эмодзи — это шесть.
function validate(current: string, next: string, repeat: string): string | null {
  if (current === '') return 'Введите текущий пароль'
  const length = [...next].length
  if (length < MIN_PASSWORD_LENGTH) {
    return `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
  }
  if (length > MAX_PASSWORD_LENGTH) {
    return `Новый пароль должен быть не длиннее ${MAX_PASSWORD_LENGTH} символов`
  }
  if (next !== repeat) return 'Пароли не совпадают'
  if (next === current) return 'Новый пароль совпадает с текущим'
  return null
}

// Смена своего пароля. После успеха сервер отзывает остальные сессии этого
// пользователя, а refresh() обновляет серверные компоненты: баннер «пароль по
// умолчанию» пропадает без перезагрузки вкладки.
// Что показать по ответу сервера. Содержательные отказы пароля (400 с кодом) он
// формулирует по-русски; всё остальное (CSRF, 500, validation_error) пришло бы
// по-английски, поэтому заменяем общим текстом.
function messageFor(err: ApiError): string {
  if (err.status === 429) {
    return 'Слишком много попыток. Подождите несколько минут и попробуйте снова.'
  }
  if (err.status === 401) return 'Сессия истекла или отозвана. Войдите в админку заново.'
  if (err.status === 400 && err.code !== 'validation_error') return err.message
  return 'Не удалось сменить пароль. Обновите страницу и попробуйте ещё раз.'
}

export function ChangePasswordForm() {
  const router = useRouter()
  const hintId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setDone(false)
    const problem = validate(current, next, repeat)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await adminChangePassword({ currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setRepeat('')
      setDone(true)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageFor(err))
      } else {
        setError('Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Смена пароля"
      className="max-w-md bg-white rounded-2xl border border-brand-border p-6 space-y-4"
    >
      {error ? (
        <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      ) : null}
      {done ? (
        <p role="status" className="p-3 rounded-lg bg-green-50 text-green-800 text-sm">
          Пароль изменён. На других устройствах вы будете разлогинены.
        </p>
      ) : null}
      <label className="block">
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Текущий пароль
        </span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={INPUT_CLASS}
        />
      </label>
      <div>
        <label className="block">
          <span className="block text-sm font-medium text-brand-text-secondary mb-1">
            Новый пароль
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={hintId}
            className={INPUT_CLASS}
          />
        </label>
        <p id={hintId} className="mt-1 text-xs text-brand-text-secondary">
          Не короче {MIN_PASSWORD_LENGTH} символов. Подойдёт фраза из нескольких слов.
        </p>
      </div>
      <label className="block">
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Повторите новый пароль
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={INPUT_CLASS}
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
      >
        {submitting ? 'Сохраняем…' : 'Сменить пароль'}
      </button>
    </form>
  )
}
