'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart'

function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`
}

export default function CartPage() {
  const { items, subtotal, remove, setQty, clear } = useCart()

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="text-3xl font-bold mb-4">Корзина</h1>
        <p className="text-neutral-500 mb-6">Корзина пуста</p>
        <Link href="/" className="text-blue-600 hover:underline">
          Вернуться на главную
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Корзина</h1>

      <ul className="space-y-4 mb-8">
        {items.map((item) => (
          <li
            key={item.productId}
            data-testid={`cart-page-item-${item.productId}`}
            className="flex items-start gap-4 border-b pb-4"
          >
            <div className="flex-1">
              <Link href={`/product/${item.slug}`} className="font-medium hover:underline">
                {item.name}
              </Link>
              <div className="text-sm text-neutral-500 mt-1">
                {formatRub(item.priceRub)} за шт.
              </div>
              <div className="mt-3 inline-flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Уменьшить количество ${item.name}`}
                  onClick={() => setQty(item.productId, item.quantity - 1)}
                  className="w-8 h-8 rounded-full border"
                >
                  −
                </button>
                <span className="min-w-[2ch] text-center">{item.quantity}</span>
                <button
                  type="button"
                  aria-label={`Увеличить количество ${item.name}`}
                  onClick={() => setQty(item.productId, item.quantity + 1)}
                  className="w-8 h-8 rounded-full border"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="font-semibold">
                {formatRub(item.priceRub * item.quantity)}
              </div>
              <button
                type="button"
                onClick={() => remove(item.productId)}
                aria-label={`Удалить ${item.name}`}
                className="text-sm text-red-600 hover:underline"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between py-4 border-t border-b mb-4">
        <span className="text-lg font-semibold">Итого</span>
        <span className="text-lg font-semibold">{formatRub(subtotal)}</span>
      </div>

      <p className="text-sm text-neutral-500 mb-6">
        Расчёт доставки — на следующем шаге
      </p>

      <div className="flex items-center gap-4">
        <Link
          href="/checkout"
          className="bg-black text-white rounded-full px-6 py-3 font-semibold"
        >
          Оформить заказ
        </Link>
        <button
          type="button"
          onClick={clear}
          className="text-sm text-neutral-600 hover:underline"
        >
          Очистить корзину
        </button>
      </div>
    </div>
  )
}
