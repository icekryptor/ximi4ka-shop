import { redirect } from 'next/navigation'
import { fetchCurrentCustomer } from '@/lib/accountServer'
import { AccountNav } from '../_components/AccountNav'
import { SupportButton } from '../_components/SupportButton'

export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const customer = await fetchCurrentCustomer()
  if (!customer) redirect('/account/login?next=/account')
  const hello =
    customer.name ??
    customer.email ??
    (customer.telegramUsername ? `@${customer.telegramUsername}` : '')
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-2 text-[var(--color-lj-ink)]">
          Личный кабинет
        </h1>
        {hello && <p className="mb-10 opacity-70">{hello}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-start">
          <aside className="flex flex-col gap-6">
            <AccountNav />
            <div className="hidden lg:block">
              <SupportButton />
            </div>
          </aside>
          <div className="flex flex-col gap-8">
            {children}
            <div className="lg:hidden">
              <SupportButton />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
