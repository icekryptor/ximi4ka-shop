'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CheckoutRequest, DeliveryDestination, DeliveryQuote } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import {
  ApiError,
  cdekWidgetServicePath,
  quoteShipping,
  submitCheckout,
  type ShippingQuoteResponse,
} from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import {
  destinationFromWidget,
  formatPeriod,
  widgetGoods,
  type WidgetDoorAddress,
  type WidgetOfficeAddress,
} from '@/lib/shipping'
import { CdekWidget } from '@/components/checkout/CdekWidget'
import {
  DELIVERY_LABELS,
  SHIPPING_RULES,
  clearIdempotencyKey,
  formatPhoneInput,
  getOrCreateIdempotencyKey,
  phoneDigits,
  redirectTo,
  validateCheckoutForm,
  type CheckoutFormErrors,
  type CheckoutFormFields,
} from '@/lib/checkout'

const INITIAL_FIELDS: CheckoutFormFields = {
  name: '',
  phone: '',
  email: '',
  apartment: '',
  comment: '',
}

type DeliveryChoice =
  | { mode: 'office'; address: WidgetOfficeAddress }
  | { mode: 'door'; address: WidgetDoorAddress }

function destinationFor(choice: DeliveryChoice, apartment: string): DeliveryDestination {
  return choice.mode === 'office'
    ? destinationFromWidget('office', choice.address)
    : destinationFromWidget('door', choice.address, apartment)
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

  // Места отправления и тарифы — с сервера: по ним виджет считает цены на
  // карте. Цена в сводке — тоже с сервера, после выбора точки.
  const [shipping, setShipping] = useState<ShippingQuoteResponse | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [choice, setChoice] = useState<DeliveryChoice | null>(null)
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [quoting, setQuoting] = useState(false)

  const cartKey = items.map((i) => `${i.productId}:${i.quantity}`).join(',')
  useEffect(() => {
    if (!hydrated || cartKey === '') return
    let cancelled = false
    quoteShipping({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      .then((data) => {
        if (!cancelled) setShipping(data)
      })
      .catch(() => {
        if (!cancelled) setShippingError('Не удалось загрузить доставку. Обновите страницу.')
      })
    return () => {
      cancelled = true
    }
    // items меняются вместе с cartKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey])

  async function handleChoose(
    mode: 'office' | 'door',
    _tariff: unknown,
    address: WidgetOfficeAddress | WidgetDoorAddress,
  ) {
    const next = (
      mode === 'office'
        ? { mode, address: address as WidgetOfficeAddress }
        : { mode, address: address as WidgetDoorAddress }
    ) as DeliveryChoice
    setChoice(next)
    setQuote(null)
    setErrors((prev) => ({ ...prev, delivery: undefined }))
    setQuoting(true)
    try {
      const data = await quoteShipping({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        destination: destinationFor(next, ''),
      })
      setQuote(data.quote)
    } catch {
      setServerError('Не удалось рассчитать доставку. Попробуйте выбрать пункт ещё раз.')
    } finally {
      setQuoting(false)
    }
  }

  const shippingRub = quote?.customerPriceRub ?? 0
  const totalRub = subtotal + shippingRub
  const period = quote ? formatPeriod(quote.periodMin, quote.periodMax) : null

  function setField<K extends keyof CheckoutFormFields>(key: K, value: CheckoutFormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const validation = validateCheckoutForm(fields, choice !== null && quote !== null)
    setErrors(validation)
    if (Object.keys(validation).length > 0 || !choice) return

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
        ...destinationFor(choice, fields.apartment),
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

              <section aria-labelledby="checkout-delivery" className="flex flex-col gap-3">
                <h2 id="checkout-delivery" className={`${LABEL_CLASS} m-0`}>
                  Доставка СДЭК *
                </h2>
                <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60 m-0">
                  До пункта выдачи — бесплатно от {formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)},
                  курьером — от {formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)}
                </p>

                {shipping ? (
                  <CdekWidget
                    goods={widgetGoods(shipping.packages)}
                    servicePath={cdekWidgetServicePath(shipping.subtotalRub)}
                    tariffs={shipping.tariffs}
                    onChoose={handleChoose}
                  />
                ) : shippingError ? (
                  <p role="alert" className={ERROR_CLASS}>
                    {shippingError}
                  </p>
                ) : (
                  <div
                    aria-busy="true"
                    className="w-full h-[560px] border border-[var(--color-lj-rule)] animate-pulse"
                  />
                )}

                {choice && (
                  <div
                    data-testid="delivery-choice"
                    className="flex flex-col gap-1 px-4 py-4 border border-[var(--color-lj-ink)] bg-[rgba(10,10,10,0.03)]"
                  >
                    <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60">
                      {DELIVERY_LABELS[choice.mode === 'office' ? 'cdek_pvz' : 'cdek_courier']}
                    </span>
                    <span className="font-lj-body text-base text-[var(--color-lj-ink)]">
                      {choice.mode === 'office'
                        ? `${choice.address.city}, ${choice.address.address}`
                        : choice.address.formatted}
                    </span>
                    <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70">
                      {quoting
                        ? 'Считаем доставку…'
                        : quote
                          ? `${quote.customerPriceRub === 0 ? 'Бесплатно' : formatRub(quote.customerPriceRub)}${period ? ` · ${period}` : ''}`
                          : ''}
                    </span>
                  </div>
                )}

                {choice?.mode === 'door' && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="checkout-apartment" className={LABEL_CLASS}>
                      Квартира, подъезд, этаж
                    </label>
                    <input
                      id="checkout-apartment"
                      type="text"
                      autoComplete="address-line2"
                      value={fields.apartment}
                      onChange={(e) => setField('apartment', e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>
                )}

                {errors.delivery && <p className={ERROR_CLASS}>{errors.delivery}</p>}
              </section>

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
                    {quote ? (shippingRub === 0 ? 'Бесплатно' : formatRub(shippingRub)) : '—'}
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
                disabled={submitting || quoting}
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
