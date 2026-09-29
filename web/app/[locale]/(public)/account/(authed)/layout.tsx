import { redirect } from 'next/navigation'
import { fetchCurrentCustomer } from '@/lib/accountServer'

export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const customer = await fetchCurrentCustomer()
  if (!customer) redirect('/account/login?next=/account')
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-10 text-[var(--color-lj-ink)]">
          Личный кабинет
        </h1>
        {children}
      </div>
    </section>
  )
}
