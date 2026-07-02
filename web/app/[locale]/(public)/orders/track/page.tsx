import type { Metadata } from 'next'
import { TrackOrderForm } from './_components/TrackOrderForm'

export const metadata: Metadata = {
  title: 'Отследить заказ — Ximi4ka',
  description: 'Введите номер заказа, чтобы посмотреть его статус.',
}

export default function TrackOrderPage() {
  return <TrackOrderForm />
}
