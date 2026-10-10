'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MATERIAL_LEAD_SOURCES } from '@ximi4ka-shop/shared/types/materialLead'
import type { MaterialLeadRequest, MaterialLeadSource } from '@ximi4ka-shop/shared'
import { ApiError, submitMaterialLead } from '@/lib/api'
import { formatPhoneInput, normalizeTelegramHandle, phoneDigits } from '@/lib/checkout'
import { METRIKA_GOALS, reachGoal } from '@/lib/metrika'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'

type Errors = Partial<Record<'name' | 'phone' | 'telegram' | 'consent', string>>

// Форма «получить материалы»: оставляем контакты и уходим на страницу со
// ссылками (/get_materials/thanks). Саму заявку принимает api.
export function MaterialsForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [source, setSource] = useState<MaterialLeadSource>(MATERIAL_LEAD_SOURCES[0])
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate(): Errors {
    const next: Errors = {}
    if (name.trim() === '') next.name = 'Введите имя'
    if (phoneDigits(phone).length !== 11)
      next.phone = 'Укажите телефон полностью: +7 (XXX) XXX-XX-XX'
    if (telegram.trim() !== '' && !normalizeTelegramHandle(telegram))
      next.telegram = 'Telegram: 5–32 латинских букв, цифр или _'
    if (!consent) next.consent = 'Нужно согласие с политикой конфиденциальности'
    return next
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const found = validate()
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return

    const payload: MaterialLeadRequest = {
      name: name.trim(),
      phone,
      ...(telegram.trim() !== '' ? { telegram: telegram.trim() } : {}),
      source,
      website,
      consent: true,
    }
    setSubmitting(true)
    try {
      await submitMaterialLead(payload)
      reachGoal(METRIKA_GOALS.materialLead)
      router.push('/get_materials/thanks')
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : 'Не удалось отправить. Попробуйте ещё раз.',
      )
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Ловушка для ботов: людям не видна и не достижима с клавиатуры. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="materials-website">Сайт</label>
        <input
          id="materials-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="materials-name" className={LABEL_CLASS}>
          Ваше имя *
        </label>
        <input
          id="materials-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className={FIELD_CLASS}
        />
        {errors.name && <p className={ERROR_CLASS}>{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="materials-phone" className={LABEL_CLASS}>
          Ваш номер телефона *
        </label>
        <input
          id="materials-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 (___) ___-__-__"
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          aria-invalid={errors.phone ? true : undefined}
          className={FIELD_CLASS}
        />
        {errors.phone && <p className={ERROR_CLASS}>{errors.phone}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="materials-telegram" className={LABEL_CLASS}>
          Ваш Телеграм
        </label>
        <input
          id="materials-telegram"
          type="text"
          autoComplete="off"
          placeholder="@username"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          aria-invalid={errors.telegram ? true : undefined}
          className={FIELD_CLASS}
        />
        {errors.telegram && <p className={ERROR_CLASS}>{errors.telegram}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="materials-source" className={LABEL_CLASS}>
          Как вы о нас узнали?
        </label>
        <select
          id="materials-source"
          value={source}
          onChange={(e) => setSource(e.target.value as MaterialLeadSource)}
          className={FIELD_CLASS}
        >
          {MATERIAL_LEAD_SOURCES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 font-lj-body text-sm text-[var(--color-lj-ink)]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-lj-brand)]"
          />
          <span>
            Нажимая «Получить методичку», вы согласны с{' '}
            <Link href="/policy" className="underline underline-offset-4">
              Политикой конфиденциальности
            </Link>
          </span>
        </label>
        {errors.consent && <p className={ERROR_CLASS}>{errors.consent}</p>}
      </div>

      {serverError && (
        <p role="alert" className={ERROR_CLASS}>
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        Получить методичку
      </button>
    </form>
  )
}
