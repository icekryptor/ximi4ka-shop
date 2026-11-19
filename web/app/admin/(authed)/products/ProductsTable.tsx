'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { Product, StockStatus } from '@ximi4ka-shop/shared'
import {
  adminPublishProduct,
  adminUnpublishProduct,
  adminUpdateProduct,
  ApiError,
  type AdminProductInput,
} from '@/lib/adminApi'
import { ProductRowActions } from './ProductRowActions'
import { parseIntegerInput } from './inlineInput'

// Таблица товаров с правкой на месте. Каждая ячейка сохраняется сразу:
// Enter или уход из поля — PATCH ровно одного поля, Esc — отмена.
// Состояние строки после ответа API берётся из ответа, поэтому при ошибке
// ячейка сама возвращается к последнему сохранённому значению.

const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: 'В наличии',
  out_of_stock: 'Нет в наличии',
  preorder: 'Предзаказ',
}

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

export function ProductsTable({ products, emptyText }: { products: Product[]; emptyText: string }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Название</th>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-3 py-3 font-medium text-right">Цена, ₽</th>
            <th className="px-3 py-3 font-medium text-right">Старая цена, ₽</th>
            <th className="px-3 py-3 font-medium">Наличие</th>
            <th className="px-3 py-3 font-medium text-right">Порядок</th>
            <th className="px-3 py-3 font-medium">Опубликован</th>
            <th className="px-4 py-3 font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-brand-text-secondary">
                {emptyText}
              </td>
            </tr>
          ) : (
            products.map((p) => <ProductRow key={p.id} initial={p} />)
          )}
        </tbody>
      </table>
    </div>
  )
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ошибка сети'
}

function ProductRow({ initial }: { initial: Product }) {
  const [product, setProduct] = useState(initial)
  const [status, setStatus] = useState<RowStatus>({ kind: 'idle' })

  async function run(action: () => Promise<Product>) {
    setStatus({ kind: 'saving' })
    try {
      setProduct(await action())
      setStatus({ kind: 'saved' })
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }

  const patch = (input: Partial<AdminProductInput>) =>
    run(() => adminUpdateProduct(product.id, input))

  return (
    <tr className="border-t border-brand-border hover:bg-brand-bg-soft/50 align-top">
      <td className="px-4 py-3 min-w-48">
        <Link
          href={`/admin/products/${product.id}`}
          className="text-brand font-medium hover:underline"
        >
          {product.name}
        </Link>
        <div className="text-brand-text-secondary font-mono text-xs mt-0.5">{product.slug}</div>
        <RowStatusLine status={status} />
      </td>
      <td className="px-4 py-3 text-brand-text-secondary font-mono text-xs whitespace-nowrap">
        {product.sku ?? '—'}
      </td>
      <td className="px-3 py-2">
        <IntegerCell
          label={`Цена «${product.name}»`}
          value={product.priceRub}
          min={0}
          onSave={(v) => patch({ priceRub: v as number })}
          onInvalid={() => setStatus({ kind: 'error', message: 'Цена — целое число ≥ 0' })}
        />
      </td>
      <td className="px-3 py-2">
        <IntegerCell
          label={`Старая цена «${product.name}»`}
          value={product.compareAtPriceRub}
          min={0}
          nullable
          onSave={(v) => patch({ compareAtPriceRub: v })}
          onInvalid={() =>
            setStatus({ kind: 'error', message: 'Старая цена — целое число ≥ 0 или пусто' })
          }
        />
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`Наличие «${product.name}»`}
          value={product.stockStatus}
          onChange={(e) => patch({ stockStatus: e.target.value as StockStatus })}
          className="input min-w-32"
        >
          {(Object.keys(STOCK_LABELS) as StockStatus[]).map((s) => (
            <option key={s} value={s}>
              {STOCK_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <IntegerCell
          label={`Порядок «${product.name}»`}
          value={product.sortOrder}
          width="w-20"
          onSave={(v) => patch({ sortOrder: v as number })}
          onInvalid={() => setStatus({ kind: 'error', message: 'Порядок — целое число' })}
        />
      </td>
      <td className="px-3 py-2">
        <label className="inline-flex items-center gap-2 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            aria-label={`Опубликован «${product.name}»`}
            checked={product.isPublished}
            disabled={status.kind === 'saving'}
            onChange={(e) =>
              run(() =>
                e.target.checked
                  ? adminPublishProduct(product.id)
                  : adminUnpublishProduct(product.id),
              )
            }
            className="h-4 w-4 accent-brand"
          />
          <span className="text-xs text-brand-text-secondary">
            {product.isPublished ? 'Да' : 'Черновик'}
          </span>
        </label>
      </td>
      <td className="px-4 py-3">
        <ProductRowActions id={product.id} name={product.name} />
      </td>
    </tr>
  )
}

function RowStatusLine({ status }: { status: RowStatus }) {
  if (status.kind === 'idle') return null
  if (status.kind === 'saving')
    return <div className="text-xs text-brand-text-secondary mt-1">Сохраняю…</div>
  if (status.kind === 'saved')
    return (
      <div role="status" className="text-xs text-green-700 mt-1">
        Сохранено
      </div>
    )
  return (
    <div role="alert" className="text-xs text-red-600 mt-1">
      Не сохранено: {status.message}
    </div>
  )
}

function format(value: number | null): string {
  return value === null ? '' : String(value)
}

// Числовая ячейка. Пока поле не в фокусе, показывает сохранённое значение;
// в фокусе — черновик. Enter сохраняет, Esc отменяет, уход из поля сохраняет.
function IntegerCell({
  label,
  value,
  min,
  nullable,
  width = 'w-24',
  onSave,
  onInvalid,
}: {
  label: string
  value: number | null
  min?: number
  nullable?: boolean
  width?: string
  onSave: (value: number | null) => Promise<void>
  onInvalid: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)

  function commit() {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const parsed = parseIntegerInput(raw, { nullable, min })
    if (parsed === 'invalid') {
      onInvalid()
      return
    }
    if (parsed === value) return
    void onSave(parsed)
  }

  // Ширина — на обёртке: глобальный .input задаёт width: 100% вне слоёв
  // Tailwind и перебивает утилиты на самом поле.
  return (
    <div className={width}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? format(value)}
        placeholder={nullable ? '—' : undefined}
        onFocus={() => setDraft(format(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
        className="input text-right tabular-nums"
      />
    </div>
  )
}
