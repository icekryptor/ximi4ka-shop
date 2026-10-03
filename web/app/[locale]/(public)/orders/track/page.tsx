import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/metadata'
import { TrackOrderForm } from './_components/TrackOrderForm'

// Форма отслеживания — служебная страница, в поиске ей делать нечего.
export const metadata: Metadata = buildMetadata({
  title: 'Отследить заказ — Химичка',
  description: 'Введите номер заказа, чтобы посмотреть его статус.',
  pathname: '/orders/track',
  noindex: true,
})

export default function TrackOrderPage() {
  return <TrackOrderForm />
}
