'use client'

import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import { pollTelegramLogin } from '@/lib/accountApi'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

interface Props {
  label: string
  start: () => Promise<{ deepLink: string }>
  onDone: () => void
  pollIntervalMs?: number
}

type State = 'idle' | 'waiting' | 'expired' | 'conflict'

// Вход/привязка через бота: открываем t.me/<бот>?start=…, ждём «Подтвердить»
// в чате, опрашивая статус (спека кабинета §4.3). 'conflict' — этот Telegram
// уже привязан к другому аккаунту (актуально при привязке из профиля, но
// обрабатываем и здесь: тот же компонент используется для входа).
export function TelegramConnect({ label, start, onDone, pollIntervalMs = 2000 }: Props) {
  const [state, setState] = useState<State>('idle')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (state !== 'waiting') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const { status } = await pollTelegramLogin()
        if (cancelled) return
        if (status === 'ok') return doneRef.current()
        if (status === 'expired') return setState('expired')
        if (status === 'conflict') return setState('conflict')
      } catch {
        // Сеть мигнула — попробуем на следующем тике.
      }
      if (!cancelled) timer = setTimeout(tick, pollIntervalMs)
    }
    timer = setTimeout(tick, pollIntervalMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state, pollIntervalMs])

  async function begin() {
    setError(null)
    try {
      const { deepLink } = await start()
      setLink(deepLink)
      window.open(deepLink, '_blank', 'noopener')
      setState('waiting')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером')
    }
  }

  if (state === 'waiting') {
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-[var(--color-lj-ink)]">
          Ждём подтверждения в Telegram… Нажмите «Старт», затем «Подтвердить» в чате с ботом.
        </p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--color-lj-brand)]"
          >
            Открыть бота ещё раз
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {state === 'expired' && (
        <p role="alert" className={ERROR_CLASS}>
          Время на подтверждение вышло.
        </p>
      )}
      {state === 'conflict' && (
        <p role="alert" className={ERROR_CLASS}>
          Этот Telegram уже привязан к другому аккаунту — войдите через Telegram и привяжите почту
          там.
        </p>
      )}
      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" onClick={() => void begin()}>
        {state === 'expired' || state === 'conflict' ? 'Начать заново' : label}
      </Button>
    </div>
  )
}
