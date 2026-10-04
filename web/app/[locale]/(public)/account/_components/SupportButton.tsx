import { SUPPORT_URL } from '@/lib/contacts'

// Ссылка на поддержку в плашке кабинета (спека §6): чат @ximi4ka_support.
export function SupportButton() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-[var(--color-lj-ink)] underline underline-offset-4 hover:text-[var(--color-lj-brand)] transition-colors"
    >
      Написать в поддержку →
    </a>
  )
}
