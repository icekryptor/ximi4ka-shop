import type { Metadata } from 'next'
import Link from 'next/link'
import { MaterialsList } from '../../_components/MaterialsList'

export const metadata: Metadata = {
  title: 'Мои материалы — Химичка',
  robots: { index: false, follow: false },
}

export default function AccountMaterialsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-lj-display font-[900] text-2xl tracking-[-0.03em] text-[var(--color-lj-ink)]">
        Мои материалы
      </h2>
      <MaterialsList />
      <p className="m-0">
        <Link
          href="/account"
          className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70 hover:opacity-100"
        >
          ← В личный кабинет
        </Link>
      </p>
    </div>
  )
}
