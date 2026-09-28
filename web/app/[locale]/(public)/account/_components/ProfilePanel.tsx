'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CustomerProfile } from '@ximi4ka-shop/shared'
import {
  getMe,
  logout,
  startLinkEmail,
  startLinkTelegram,
  unlinkEmail,
  unlinkTelegram,
  updateMe,
  verifyLinkEmail,
} from '@/lib/accountApi'
import { ApiError } from '@/lib/api'
import { formatPhoneInput, phoneDigits, redirectTo } from '@/lib/checkout'
import { Button } from '@/components/ui'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'
import { EmailCodeForm } from './EmailCodeForm'
import { TelegramConnect } from './TelegramConnect'

export function ProfilePanel() {
  const [me, setMe] = useState<CustomerProfile | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState(false)

  const refresh = useCallback(async () => {
    const p = await getMe()
    setMe(p)
    setName(p.name ?? '')
    setPhone(p.phone ? formatPhoneInput(p.phone) : '')
  }, [])

  useEffect(() => {
    // Deferred via queueMicrotask so the setState calls inside `refresh` land
    // in a separate render pass — same pattern RevisionsPanel uses to satisfy
    // react-hooks/set-state-in-effect.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      refresh().catch(() => {
        if (!cancelled) setError('Не удалось загрузить данные. Обновите страницу.')
      })
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      const digits = phoneDigits(phone)
      const updated = await updateMe({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(digits ? { phone: `+${digits}` } : {}),
      })
      setMe(updated)
      setNotice('Сохранено')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие')
    }
  }

  if (!me)
    return error ? (
      <p role="alert" className={ERROR_CLASS}>
        {error}
      </p>
    ) : (
      <div className="min-h-[30vh]" />
    )

  // Отвязать последний способ входа нельзя (409 last_login_method на сервере) —
  // прячем кнопку заранее, чтобы не бить в заведомо отказывающий запрос.
  const canUnlinkEmail = me.email !== null && me.hasTelegram
  const canUnlinkTelegram = me.hasTelegram && me.email !== null

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={save} className="flex flex-col gap-4 max-w-[480px]">
        <label htmlFor="profile-name" className={LABEL_CLASS}>
          Имя
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={FIELD_CLASS}
        />
        <label htmlFor="profile-phone" className={LABEL_CLASS}>
          Телефон
        </label>
        <input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+7 (___) ___-__-__"
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          className={FIELD_CLASS}
        />
        <p className="text-sm opacity-60">
          Подставим их в оформление заказа, чтобы не вводить заново.
        </p>
        {notice && <p className="text-[var(--color-lj-brand)]">{notice}</p>}
        <Button type="submit" loading={saving}>
          Сохранить
        </Button>
      </form>

      <section className="flex flex-col gap-3 max-w-[480px]">
        <h2 className={LABEL_CLASS}>Email</h2>
        {me.email && !editEmail && <p>{me.email}</p>}
        {editEmail ? (
          <EmailCodeForm
            start={startLinkEmail}
            verify={verifyLinkEmail}
            submitLabel="Подтвердить"
            onDone={() => {
              setEditEmail(false)
              void refresh()
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-4">
            <Button type="button" variant="link" onClick={() => setEditEmail(true)}>
              {me.email ? 'Изменить email' : 'Привязать email'}
            </Button>
            {canUnlinkEmail && (
              <Button type="button" variant="link" onClick={() => void run(unlinkEmail)}>
                Отвязать email
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 max-w-[480px]">
        <h2 className={LABEL_CLASS}>Telegram</h2>
        {me.hasTelegram ? (
          <>
            <p>{me.telegramUsername ? `@${me.telegramUsername}` : 'привязан'}</p>
            {canUnlinkTelegram && (
              <Button type="button" variant="link" onClick={() => void run(unlinkTelegram)}>
                Отвязать Telegram
              </Button>
            )}
          </>
        ) : (
          <TelegramConnect
            label="Привязать Telegram"
            start={startLinkTelegram}
            onDone={() => void refresh()}
          />
        )}
      </section>

      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}

      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void logout()
              .catch(() => {})
              .then(() => redirectTo('/'))
          }
        >
          Выйти
        </Button>
      </div>
    </div>
  )
}
