import type { Metadata } from 'next'
import { OrdersList } from '../_components/OrdersList'
import { ProfileCard } from '../_components/ProfileCard'

export const metadata: Metadata = { title: 'Личный кабинет — Ximi4ka', robots: { index: false } }

// Одна страница: сверху плашка с личными данными, ниже история заказов.
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-10">
      <ProfileCard />
      <section aria-labelledby="account-orders-heading" className="flex flex-col gap-4">
        <h2
          id="account-orders-heading"
          className="font-lj-display font-[900] text-2xl tracking-[-0.03em] text-[var(--color-lj-ink)]"
        >
          Мои заказы
        </h2>
        <OrdersList />
      </section>
    </div>
  )
}
