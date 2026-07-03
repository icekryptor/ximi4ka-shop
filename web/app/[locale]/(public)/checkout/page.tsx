'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CheckoutRequest, DeliveryMethod } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { ApiError, submitCheckout } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import {
  DELIVERY_LABELS,
  SHIPPING_RULES,
  calcShippingRub,
  clearIdempotencyKey,
  formatPhoneInput,
  getOrCreateIdempotencyKey,
  phoneDigits,
  redirectTo,
  validateCheckoutForm,
  type CheckoutFormErrors,
  type CheckoutFormFields,
} from '@/lib/checkout'

const DELIVERY_METHODS: DeliveryMethod[] = ['cdek_pvz', 'cdek_courier']

const INITIAL_FIELDS: CheckoutFormFields = {
  name: '',
  phone: '',
  email: '',
  method: 'cdek_pvz',
  address: '',
  comment: '',
}

const FIELD_CLASS =
  'w-full px-4 py-3 bg-transparent border border-[var(--color-lj-rule)] rounded-none font-lj-body text-base text-[var(--color-lj-ink)] placeholder:opacity-40 focus:outline-none focus:border-[var(--color-lj-ink)] transition-colors'

const LABEL_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70'

const ERROR_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-stock-danger)]'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clear } = useCart()
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const [fields, setFields] = useState<CheckoutFormFields>(INITIAL_FIELDS)
  const [errors, setErrors] = useState<CheckoutFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const shippingRub = calcShippingRub(fields.method, subtotal)
  const totalRub = subtotal + shippingRub

  function setField<K extends keyof CheckoutFormFields>(
    key: K,
    value: CheckoutFormFields[K],
  ) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const validation = validateCheckoutForm(fields)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    const email = fields.email.trim()
    const comment = fields.comment.trim()
    const payload: CheckoutRequest = {
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      customer: {
        name: fields.name.trim(),
        phone: `+${phoneDigits(fields.phone)}`,
        ...(email !== '' ? { email } : {}),
      },
      delivery: {
        method: fields.method,
        address: fields.address.trim(),
        ...(comment !== '' ? { comment } : {}),
      },
    }

    setSubmitting(true)
    setServerError(null)
    try {
      // The key survives failed attempts (sessionStorage): a retry re-sends
      // the same one, so the server never creates a duplicate order.
      const result = await submitCheckout(payload, getOrCreateIdempotencyKey())
      clearIdempotencyKey()
      clear()
      if (result.paymentUrl) {
        redirectTo(result.paymentUrl)
      } else {
        router.push(`/order/${result.orderNumber}?new=1`)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Наличие/доступность товаров изменились между корзиной и сабмитом.
          setServerError(`${err.message}. Обновите корзину и попробуйте ещё раз.`)
        } else {
          setServerError(`Не удалось оформить заказ: ${err.message}`)
        }
      } else {
        setServerError(
          'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.',
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
          КОРЗИНА → ОФОРМЛЕНИЕ
        </p>

        <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] mb-12 text-[var(--color-lj-ink)]">
          Оформление заказа
        </h1>

        {!hydrated ? (
          <div className="min-h-[40vh]" />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-6">
            <p className="text-xl text-[var(--color-lj-ink)] opacity-70">Корзина пуста</p>
            <Link
              href="/categories"
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
            >
              Открыть каталог →
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 items-start"
          >
            {/* ---- Левая колонка: данные покупателя и доставка ---- */}
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-name" className={LABEL_CLASS}>
                  Имя *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  autoComplete="name"
                  value={fields.name}
                  onChange={(e) => setField('name', e.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.name && <p className={ERROR_CLASS}>{errors.name}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-phone" className={LABEL_CLASS}>
                  Телефон *
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  value={fields.phone}
                  onChange={(e) => setField('phone', formatPhoneInput(e.target.value))}
                  aria-invalid={errors.phone ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.phone && <p className={ERROR_CLASS}>{errors.phone}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-email" className={LABEL_CLASS}>
                  Email
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={fields.email}
                  onChange={(e) => setField('email', e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.email && <p className={ERROR_CLASS}>{errors.email}</p>}
              </div>

              <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
                <legend className={`${LABEL_CLASS} mb-3 p-0`}>Способ доставки</legend>
                {DELIVERY_METHODS.map((method) => {
                  const rule = SHIPPING_RULES[method]
                  const priceForMethod = calcShippingRub(method, subtotal)
                  const active = fields.method === method
                  return (
                    <label
                      key={method}
                      className={`flex items-center justify-between gap-4 px-4 py-4 border cursor-pointer transition-colors ${
                        active
                          ? 'border-[var(--color-lj-ink)] bg-[rgba(10,10,10,0.03)]'
                          : 'border-[var(--color-lj-rule)] hover:border-[var(--color-lj-ink)]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="delivery-method"
                          value={method}
                          checked={active}
                          onChange={() => setField('method', method)}
                          className="accent-[var(--color-lj-brand)]"
                        />
                        <span className="font-lj-body text-base text-[var(--color-lj-ink)]">
                          {DELIVERY_LABELS[method]}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="font-lj-display font-[700] text-base tracking-[-0.02em] text-[var(--color-lj-ink)]">
                          {priceForMethod === 0 ? 'Бесплатно' : formatRub(priceForMethod)}
                        </span>
                        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60">
                          бесплатно от {formatRub(rule.freeFromRub)}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-address" className={LABEL_CLASS}>
                  Адрес доставки *
                </label>
                <input
                  id="checkout-address"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Город, улица, дом — или адрес пункта выдачи СДЭК"
                  value={fields.address}
                  onChange={(e) => setField('address', e.target.value)}
                  aria-invalid={errors.address ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.address && <p className={ERROR_CLASS}>{errors.address}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-comment" className={LABEL_CLASS}>
                  Комментарий к заказу
                </label>
                <textarea
                  id="checkout-comment"
                  rows={3}
                  value={fields.comment}
                  onChange={(e) => setField('comment', e.target.value)}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </div>
            </div>

            {/* ---- Правая колонка: сводка заказа ---- */}
            <aside className="border border-[var(--color-lj-rule)] p-6 flex flex-col gap-5 lg:sticky lg:top-24">
              <h2 className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] opacity-70 m-0">
                Ваш заказ
              </h2>

              <ul className="list-none p-0 m-0 flex flex-col">
                {items.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-baseline justify-between gap-4 py-3 border-b border-[var(--color-lj-rule)]"
                  >
                    <span className="font-lj-body text-base text-[var(--color-lj-ink)] min-w-0 truncate">
                      {item.name}
                      <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] opacity-60">
                        {' '}
                        × {item.quantity}
                      </span>
                    </span>
                    <span className="font-lj-display font-[700] text-base tracking-[-0.02em] text-[var(--color-lj-ink)] whitespace-nowrap">
                      {formatRub(item.priceRub * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                  <span>Подытог</span>
                  <span data-testid="summary-subtotal">{formatRub(subtotal)}</span>
                </div>
                <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                  <span>Доставка</span>
                  <span data-testid="summary-shipping">
                    {shippingRub === 0 ? 'Бесплатно' : formatRub(shippingRub)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--color-lj-rule)] pt-4 font-lj-display font-[900] text-2xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
                  <span>Итого</span>
                  <span data-testid="summary-total">{formatRub(totalRub)}</span>
                </div>
              </div>

              {serverError && (
                <p role="alert" className={ERROR_CLASS}>
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Оформляем…' : 'Оформить заказ →'}
              </button>

              <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-50 m-0">
                Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных
              </p>
            </aside>
          </form>
        )}
      </div>
    </section>
  )
}
