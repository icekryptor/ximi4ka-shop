export const SUPPORT_URL = 'https://t.me/ximi4ka_support'

// Кнопка поддержки кабинета (спека §6): чат @ximi4ka_support.
export function SupportButton() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-lj-ink)] px-5 py-3 font-lj-mono uppercase tracking-[0.06em] text-[length:var(--text-lj-mono-sm)] text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-cream)] transition-colors"
    >
      Написать в поддержку →
    </a>
  )
}
