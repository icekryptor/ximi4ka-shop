'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAdjustCoins, ApiError } from '@/lib/adminApi'
import { formatCoins } from '@/lib/coins'

const MAX_AMOUNT = 100000
const MIN_COMMENT = 3
const MAX_COMMENT = 500

type Mode = 'credit' | 'debit'

// Ручная правка баланса. requestId создаётся при открытии формы и меняется только
// после УСПЕШНОЙ отправки: повтор после сетевой ошибки не удвоит правку.
export function CoinAdjustForm({ customerId }: { customerId: string }) {
  const router = useRouter()
  const amountId = useId()
  const commentId = useId()
  const [mode, setMode] = useState<Mode>('credit')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newBalance, setNewBalance] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setNewBalance(null)

    const trimmed = comment.trim()
    if (!/^\d+$/.test(amount.trim()) || Number(amount) < 1 || Number(amount) > MAX_AMOUNT) {
      setError(`Сумма — целое число от 1 до ${formatCoins(MAX_AMOUNT)}.`)
      return
    }
    if (trimmed.length < MIN_COMMENT || trimmed.length > MAX_COMMENT) {
      setError(`Комментарий обязателен: от ${MIN_COMMENT} до ${MAX_COMMENT} символов.`)
      return
    }

    const value = Number(amount)
    setBusy(true)
    try {
      const res = await adminAdjustCoins(customerId, {
        amount: mode === 'credit' ? value : -value,
        comment: trimmed,
        requestId,
      })
      setNewBalance(res.balance)
      setAmount('')
      setComment('')
      setRequestId(crypto.randomUUID())
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_coins') {
        setError('На балансе меньше, чем вы списываете')
      } else if (err instanceof ApiError && err.code === 'request_id_conflict') {
        setError('Этот запрос уже был отправлен с другими данными — обновите страницу')
      } else {
        setError(err instanceof ApiError ? err.message : 'Не удалось изменить баланс')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div role="radiogroup" aria-label="Операция" className="flex gap-2">
        {(['credit', 'debit'] as const).map((m) => (
          <label
            key={m}
            className={
              mode === m
                ? 'px-3 py-1.5 rounded-full bg-brand text-white text-sm font-semibold cursor-pointer'
                : 'px-3 py-1.5 rounded-full bg-white border border-brand-border text-sm text-brand-text-secondary cursor-pointer'
            }
          >
            <input
              type="radio"
              name="coin-mode"
              value={m}
              aria-label={m === 'credit' ? 'Начислить' : 'Списать'}
              checked={mode === m}
              onChange={() => setMode(m)}
              className="sr-only"
            />
            {m === 'credit' ? 'Начислить' : 'Списать'}
          </label>
        ))}
      </div>

      <div>
        <label htmlFor={amountId} className="block text-sm text-brand-text-secondary">
          Сумма, химикоинов
        </label>
        <input
          id={amountId}
          type="number"
          min={1}
          max={MAX_AMOUNT}
          step={1}
          inputMode="numeric"
          onWheel={(e) => e.currentTarget.blur()}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-40 rounded-xl border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>

      <div>
        <label htmlFor={commentId} className="block text-sm text-brand-text-secondary">
          Комментарий (обязательно)
        </label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={MAX_COMMENT}
          placeholder="Например: компенсация за задержку заказа"
          className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {newBalance !== null && (
        <p role="status" className="text-sm text-green-700">
          Готово. Новый баланс: {formatCoins(newBalance)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
      >
        {busy ? 'Отправляем…' : 'Применить'}
      </button>
    </form>
  )
}
