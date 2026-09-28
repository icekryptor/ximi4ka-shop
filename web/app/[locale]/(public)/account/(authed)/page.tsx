import type { Metadata } from 'next'
import { OrdersList } from '../_components/OrdersList'

export const metadata: Metadata = { title: 'Мои заказы — Ximi4ka', robots: { index: false } }

export default function AccountOrdersPage() {
  return <OrdersList />
}
