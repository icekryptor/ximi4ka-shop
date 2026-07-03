'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PublicOrderStatus } from '@ximi4ka-shop/shared'
import { ApiError, getOrderStatus } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import {
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_MAX_ATTEMPTS,
  orderStatusLabel,
  orderTimelineSteps,
  type OrderTimelineStep,
} from '@/lib/orderStatus'

interface Props {
  orderNumber: string
  /** true при переходе с чекаута (?new=1) — праздничный хедер «Заказ принят!» */
  celebrate: boolean
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

// Точка шага таймлайна: пройден — заполнена bone, активный — brand (или
// danger/success по тону), будущий — контур.
function stepDotClass(step: OrderTimelineStep): string {
  if (step.state === 'active') {
    if (step.tone === 'danger') return 'bg-[var(--color-stock-danger)]'
    if (step.tone === 'success') return 'bg-[var(--color-stock-success)]'
    return 'bg-[var(--color-lj-brand)]'
  }
  if (step.state === 'done') return 'bg-[var(--color-lj-bone)]'
  return 'border border-[var(--color-lj-bone-mute)] bg-transparent'
}

function stepLabelClass(step: OrderTimelineStep): string {
  if (step.state === 'active') {
    if (step.tone === 'danger') return 'text-[var(--color-stock-danger)]'
    if (step.tone === 'success') return 'text-[var(--color-stock-success)]'
    return 'text-[var(--color-lj-brand)]'
  }
  if (step.state === 'done') return 'text-[var(--color-lj-bone)]'
  return 'text-[var(--color-lj-bone-mute)]'
}

function MetaRow({
  label,
  children,
  testId,
}: {
  label: string
  children: React.ReactNode
  testId: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-[var(--color-lj-rule-on-ink)]">
      <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)]">
        {label}
      </span>
      <span
        data-testid={testId}
        className="font-lj-display font-[700] text-lg tracking-[-0.02em] text-[var(--color-lj-bone)]"
      >
        {children}
      </span>
    </div>
  )
}

export function OrderStatusView({ orderNumber, celebrate }: Props) {
  const [order, setOrder] = useState<PublicOrderStatus | null>(null)
  const [error, setError] = useState<'not_found' | 'network' | null>(null)

  // Первичная загрузка статуса.
  useEffect(() => {
    let cancelled = false
    getOrderStatus(orderNumber)
      .then((data) => {
        if (cancelled) return
        setOrder(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'network')
      })
    return () => {
      cancelled = true
    }
  }, [orderNumber])

  // Поллинг, пока tbank-платёж в полёте: каждые 5 секунд, максимум 5 минут.
  // Как только статус становится терминальным, shouldPoll → false и cleanup
  // снимает интервал.
  const shouldPoll = order?.status === 'pending' && order.paymentProvider === 'tbank'
  useEffect(() => {
    if (!shouldPoll) return
    let attempts = 0
    const id = setInterval(() => {
      attempts += 1
      if (attempts > ORDER_POLL_MAX_ATTEMPTS) {
        clearInterval(id)
        return
      }
      getOrderStatus(orderNumber)
        .then(setOrder)
        .catch(() => {
          // Транзиентная ошибка поллинга — молча ждём следующего тика.
        })
    }, ORDER_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [shouldPoll, orderNumber])

  if (error === 'not_found') {
    return (
      <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[70vh]">
        <div className="max-w-[var(--max-lj-narrow)] mx-auto flex flex-col items-start gap-6">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] opacity-70">
            ЗАКАЗ · НЕ НАЙДЕН
          </p>
          <h1 className="font-lj-display font-[900] text-[clamp(2rem,4vw,3.5rem)] leading-[0.95] tracking-[-0.045em] m-0 text-[var(--color-lj-ink)]">
            Заказ не найден
          </h1>
          <p className="text-lg text-[var(--color-lj-ink)] opacity-70 m-0 max-w-[48ch]">
            Проверьте номер — он выглядит как XM-2026-00042 и указан в письме
            и SMS о заказе.
          </p>
          <Link
            href="/orders/track"
            className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
          >
            Отследить заказ →
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[70vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        {celebrate ? (
          <header className="mb-12">
            <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
              ЛАБОРАТОРНЫЙ ЖУРНАЛ · НОВАЯ ЗАПИСЬ
            </p>
            <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] m-0 mb-6 text-[var(--color-lj-ink)]">
              Заказ{' '}
              <span className="italic text-[var(--color-lj-brand)]">принят!</span>
            </h1>
            <div className="max-w-[56ch]">
              <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] opacity-70 mb-3">
                Что дальше
              </p>
              <ol className="list-none p-0 m-0 flex flex-col gap-2 text-base text-[var(--color-lj-ink)]">
                <li>
                  <span className="text-[var(--color-lj-brand)]">01</span> — мы
                  подтвердим заказ и наличие наборов
                </li>
                <li>
                  <span className="text-[var(--color-lj-brand)]">02</span> — соберём и
                  передадим посылку в СДЭК
                </li>
                <li>
                  <span className="text-[var(--color-lj-brand)]">03</span> — пришлём
                  трек-номер для отслеживания
                </li>
              </ol>
            </div>
          </header>
        ) : (
          <header className="mb-12">
            <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
              ЗАКАЗ · СТАТУС
            </p>
            <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] m-0 text-[var(--color-lj-ink)]">
              Статус заказа
            </h1>
          </header>
        )}

        {/* Ink instrument readout — приборная панель заказа. */}
        <div className="bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] p-8 sm:p-12 max-w-3xl">
          <div className="flex items-center justify-between font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)] mb-6 pb-4 border-b border-[var(--color-lj-rule-on-ink)]">
            <span>ЗАКАЗ</span>
            <span>№</span>
          </div>

          <p
            data-testid="order-number"
            className="font-lj-display font-[900] leading-none tracking-[-0.045em] text-[clamp(1.75rem,4.5vw,3.25rem)] m-0 mb-10 break-all"
          >
            {orderNumber}
          </p>

          {order === null && error === null && (
            <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)]">
              Загружаем статус…
            </p>
          )}

          {error === 'network' && (
            <p role="alert" className="font-lj-mono text-[length:var(--text-lj-mono-sm)] tracking-[0.04em] text-[var(--color-stock-danger)]">
              Не удалось загрузить статус заказа. Обновите страницу или попробуйте позже.
            </p>
          )}

          {order && (
            <>
              <ol
                data-testid="order-timeline"
                className="list-none p-0 m-0 mb-10 grid grid-cols-3 gap-2"
              >
                {orderTimelineSteps(order.status, order.paymentProvider).map((step) => (
                  <li
                    key={step.label}
                    aria-current={step.state === 'active' ? 'step' : undefined}
                    className="flex flex-col gap-3"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full shrink-0 ${stepDotClass(step)}`}
                      />
                      <span className="flex-1 h-px bg-[var(--color-lj-rule-on-ink)]" />
                    </span>
                    <span
                      className={`font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] ${stepLabelClass(step)}`}
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-col mb-8">
                <MetaRow label="Статус" testId="order-status-label">
                  {orderStatusLabel(order.status, order.paymentProvider)}
                </MetaRow>
                <MetaRow label="Сумма" testId="order-total">
                  {formatRub(order.totalRub)}
                </MetaRow>
                <MetaRow label="Дата" testId="order-date">
                  {formatDate(order.createdAt)}
                </MetaRow>
                {order.paidAt && (
                  <MetaRow label="Оплачен" testId="order-paid-at">
                    {formatDate(order.paidAt)}
                  </MetaRow>
                )}
              </div>

              <div aria-live="polite">
                {order.status === 'pending' && order.paymentProvider === 'manual' && (
                  <p className="text-base text-[var(--color-lj-bone)] opacity-80 m-0 max-w-[52ch]">
                    Менеджер свяжется с вами в ближайшее время, чтобы подтвердить
                    заказ и договориться об оплате.
                  </p>
                )}
                {order.status === 'pending' && order.paymentProvider === 'tbank' && (
                  <p className="text-base text-[var(--color-lj-bone)] opacity-80 m-0 max-w-[52ch]">
                    Ожидаем подтверждение оплаты — страница обновится автоматически.
                  </p>
                )}
                {order.status === 'failed' && (
                  <p className="text-base text-[var(--color-lj-bone)] opacity-80 m-0 max-w-[52ch]">
                    Оплата не прошла. Попробуйте оформить заказ ещё раз или напишите
                    нам — поможем разобраться.
                  </p>
                )}
                {order.status === 'cancelled' && (
                  <p className="text-base text-[var(--color-lj-bone)] opacity-80 m-0 max-w-[52ch]">
                    Заказ отменён. Если это произошло по ошибке — свяжитесь с нами,
                    мы всё восстановим.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-10">
          <Link
            href="/categories"
            className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)]"
          >
            ← Вернуться в каталог
          </Link>
        </p>
      </div>
    </section>
  )
}
