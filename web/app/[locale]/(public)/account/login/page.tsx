import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { fetchAuthConfigServer, fetchCurrentCustomer } from '@/lib/accountServer'
import { safeNext } from '@/lib/safeNext'
import { LoginPanel } from '../_components/LoginPanel'

export const metadata: Metadata = {
  title: 'Вход в личный кабинет — Ximi4ka',
  robots: { index: false },
}

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const next = safeNext((await searchParams).next)
  if (await fetchCurrentCustomer()) redirect(next)
  const config = await fetchAuthConfigServer()
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[480px] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-10 text-[var(--color-lj-ink)]">
          Вход в личный кабинет
        </h1>
        <LoginPanel next={next} config={config} />
      </div>
    </section>
  )
}
