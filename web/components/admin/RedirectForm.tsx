'use client'

import { useState } from 'react'
import {
  ApiError,
  type AdminRedirectInput,
  type Redirect,
} from '@/lib/adminApi'

interface Props {
  mode: 'create' | 'edit'
  initialValue?: Redirect
  onSubmit: (input: AdminRedirectInput) => Promise<void>
  submitting: boolean
  error?: ApiError | null
}

// Redirect create/edit form. Hit count is display-only (and only on edit);
// it's a traffic-derived metric and must not be manipulable from the admin.
// The form validates:
//   - fromPath starts with "/"
//   - fromPath does NOT start with any reserved prefix
//   - toPath is either a site-relative path ("/...") or an absolute http(s)
//     URL (so admins can redirect off-site, e.g. to a marketing landing)
//   - statusCode is one of 301, 302, 307, 308
const RESERVED_PREFIXES = ['/admin', '/api', '/uploads', '/_next']
const STATUS_CODES = [301, 302, 307, 308] as const

function isReservedFromPath(value: string): boolean {
  return RESERVED_PREFIXES.some(
    (p) => value === p || value.startsWith(`${p}/`),
  )
}

function validateToPath(value: string): string | null {
  if (!value) return 'Укажите целевой путь.'
  if (value.startsWith('/')) return null
  if (/^https?:\/\//i.test(value)) return null
  return 'Путь должен начинаться с / либо быть абсолютным http(s)-адресом.'
}

export function RedirectForm({
  mode,
  initialValue,
  onSubmit,
  submitting,
  error,
}: Props) {
  const [fromPath, setFromPath] = useState(initialValue?.fromPath ?? '')
  const [toPath, setToPath] = useState(initialValue?.toPath ?? '')
  const [statusCode, setStatusCode] = useState<number>(
    initialValue?.statusCode ?? 301,
  )
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const trimmedFrom = fromPath.trim()
    const trimmedTo = toPath.trim()

    if (!trimmedFrom) {
      setFormError('Укажите исходный путь.')
      return
    }
    if (!trimmedFrom.startsWith('/')) {
      setFormError('Исходный путь должен начинаться с /.')
      return
    }
    if (isReservedFromPath(trimmedFrom)) {
      setFormError(
        'Исходный путь не может начинаться с /admin, /api, /uploads или /_next.',
      )
      return
    }

    const toErr = validateToPath(trimmedTo)
    if (toErr) {
      setFormError(toErr)
      return
    }

    if (!STATUS_CODES.includes(statusCode as (typeof STATUS_CODES)[number])) {
      setFormError('Неверный код редиректа.')
      return
    }

    await onSubmit({
      fromPath: trimmedFrom,
      toPath: trimmedTo,
      statusCode,
    })
  }

  const conflict = error?.code === 'from_path_conflict'

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={
        mode === 'create' ? 'Создание редиректа' : 'Редактирование редиректа'
      }
      className="space-y-6"
    >
      <section className="bg-white rounded-2xl border border-brand-border p-6 space-y-4">
        <Field
          label="Исходный путь (from)"
          htmlFor="from-path"
          error={
            conflict ? 'Редирект с таким исходным путём уже существует.' : undefined
          }
        >
          <input
            id="from-path"
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            placeholder="/old-url"
            required
            className="input"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Должен начинаться с /. Нельзя использовать /admin, /api, /uploads, /_next.
          </p>
        </Field>

        <Field label="Целевой путь (to)" htmlFor="to-path">
          <input
            id="to-path"
            value={toPath}
            onChange={(e) => setToPath(e.target.value)}
            placeholder="/new-url или https://example.com"
            required
            className="input"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Относительный путь (/...) или абсолютный http(s) URL.
          </p>
        </Field>

        <Field label="HTTP-статус" htmlFor="status-code">
          <select
            id="status-code"
            value={statusCode}
            onChange={(e) => setStatusCode(Number(e.target.value))}
            className="input"
          >
            <option value={301}>301 — постоянный</option>
            <option value={302}>302 — временный</option>
            <option value={307}>307 — временный (сохранить метод)</option>
            <option value={308}>308 — постоянный (сохранить метод)</option>
          </select>
        </Field>

        {mode === 'edit' && initialValue ? (
          <div className="text-sm text-brand-text-secondary">
            Хиты: <span className="font-mono">{initialValue.hitCount}</span>
          </div>
        ) : null}
      </section>

      {formError || (error && !conflict) ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {formError ?? error?.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-full bg-brand text-white font-semibold disabled:opacity-50"
        >
          {submitting
            ? 'Сохранение...'
            : mode === 'create'
              ? 'Создать'
              : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-brand-text-secondary mb-1"
      >
        {label}
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
