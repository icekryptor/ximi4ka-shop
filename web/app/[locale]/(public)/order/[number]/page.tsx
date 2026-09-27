import type { Metadata } from 'next'
import { OrderStatusView } from './_components/OrderStatusView'

// Страница статуса заказа. Номер заказа гуляет по URL (письма, чаты
// поддержки) — страница никогда не должна попадать в индекс.

interface Props {
  params: Promise<{ locale: string; number: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function decodeNumber(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { number } = await params
  return {
    title: `Заказ ${decodeNumber(number)} — Ximi4ka`,
    robots: { index: false, follow: false },
  }
}

export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { number } = await params
  const sp = await searchParams
  // Секрет заказа (#t=…) читает сам OrderStatusView: фрагмент до сервера не доходит.
  return (
    <OrderStatusView
      orderNumber={decodeNumber(number)}
      celebrate={sp.new === '1'}
      paymentFailed={sp.payment === 'failed'}
    />
  )
}
