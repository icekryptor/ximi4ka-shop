import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/metadata'
import { MATERIALS_GUIDE_URL } from '@/lib/contacts'
import { MaterialsForm } from './_components/MaterialsForm'

// Сюда ведут QR-коды на наборах — в поиске странице делать нечего.
export const metadata: Metadata = buildMetadata({
  title: 'Видеоуроки и обучающие материалы — Химичка',
  description: 'Оставьте контакты и получите видеоуроки и методичку к набору.',
  pathname: '/get_materials',
  noindex: true,
})

export default function GetMaterialsPage() {
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[70vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-6 text-[var(--color-lj-ink)] uppercase max-w-[20ch]">
          Получить видеоуроки и обучающие материалы
        </h1>

        <a
          href={MATERIALS_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 mb-10 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full border border-[var(--color-lj-ink)] text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-cream)] transition-colors"
        >
          Электронная методичка тут →
        </a>

        <div className="max-w-md">
          <MaterialsForm />
        </div>
      </div>
    </section>
  )
}
