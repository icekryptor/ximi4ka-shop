import Link from 'next/link'

// Вход в раздел «Мои материалы» с главной страницы кабинета.
export function MaterialsLink() {
  return (
    <Link
      href="/account/materials"
      className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-lj-rule)] bg-white px-5 py-4 font-lj-display font-[900] text-xl tracking-[-0.03em] text-[var(--color-lj-ink)] transition hover:bg-[var(--color-lj-cream-shade)]"
    >
      <span>Мои материалы</span>
      <span aria-hidden="true">→</span>
    </Link>
  )
}
