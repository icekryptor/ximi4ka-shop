import type { Metadata } from 'next'
import { getPublicSettings } from '@/lib/api'
import { CoinsCard } from '../_components/CoinsCard'
import { MaterialsLink } from '../_components/MaterialsLink'
import { OrdersList } from '../_components/OrdersList'
import { ProfileCard } from '../_components/ProfileCard'

export const metadata: Metadata = {
  title: 'Личный кабинет — Химичка',
  robots: { index: false, follow: false },
}

// Одна страница: сверху плашка с личными данными, ниже история заказов.
async function coinsProgramEnabled(): Promise<boolean> {
  try {
    return Boolean((await getPublicSettings())?.coins)
  } catch {
    return false
  }
}

export default async function AccountPage() {
  const programEnabled = await coinsProgramEnabled()
  return (
    <div className="flex flex-col gap-10">
      <ProfileCard />
      <CoinsCard programEnabled={programEnabled} />
      <MaterialsLink />
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
