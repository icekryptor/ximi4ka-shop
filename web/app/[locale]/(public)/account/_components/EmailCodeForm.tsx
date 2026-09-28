'use client'

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'

const RESEND_SECONDS = 60

interface Props {
  start: (email: string) => Promise<void>
  verify: (email: string, code: string) => Promise<unknown>
  onDone: () => void
  submitLabel?: string
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_code') {
      const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft
      return left ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код'
    }
    return err.message
  }
  return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
}

// Шаги «email → код». Общая для входа и привязки email в профиле.
export function EmailCodeForm({ start, verify, onDone, submitLabel = 'Войти' }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await start(email.trim())
      setStep('code')
      setCode('')
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verify(email.trim(), code)
      onDone()
    } catch (err) {
      setError(messageFor(err))
      setBusy(false)
    }
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="account-email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
        {error && <p className={ERROR_CLASS}>{error}</p>}
        <Button type="submit" loading={busy} disabled={busy || email.trim() === ''}>
          Получить код
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} className="flex flex-col gap-3">
      <p className="text-[var(--color-lj-ink)] opacity-80">
        Отправили код на <b>{email}</b>. Письмо может идти пару минут — загляните и в «Спам».
      </p>
      <label htmlFor="account-code" className={LABEL_CLASS}>
        Код из письма
      </label>
      <input
        id="account-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className={`${FIELD_CLASS} font-lj-mono tracking-[0.5em] text-center text-2xl`}
        autoFocus
      />
      {error && <p className={ERROR_CLASS}>{error}</p>}
      <Button type="submit" loading={busy} disabled={busy || code.length !== 6}>
        {submitLabel}
      </Button>
      <div className="flex flex-wrap gap-4">
        <Button
          type="button"
          variant="link"
          disabled={busy || resendIn > 0}
          onClick={() => void send()}
        >
          {resendIn > 0 ? `Отправить ещё раз через ${resendIn} с` : 'Отправить ещё раз'}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setStep('email')
            setError(null)
          }}
        >
          Изменить email
        </Button>
      </div>
    </form>
  )
}
