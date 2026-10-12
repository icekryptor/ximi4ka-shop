import type { Methodichka } from '@ximi4ka-shop/shared'

// Ссылки на электронные методички к оплаченному заказу. `dark` — страница
// заказа на тёмном фоне, `light` — раскрытая строка заказа в кабинете.
export function MethodichkiDownloads({
  items,
  tone = 'dark',
}: Readonly<{ items: Methodichka[]; tone?: 'dark' | 'light' }>) {
  if (items.length === 0) return null
  const dark = tone === 'dark'
  return (
    <section data-testid="methodichki" className="flex flex-col gap-3">
      <h2
        className={`m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] ${
          dark ? 'text-[var(--color-lj-bone-mute)]' : 'opacity-60'
        }`}
      >
        Ваши электронные методички
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((m) => (
          <li key={m.key}>
            <a
              href={m.url}
              download
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 ${
                dark
                  ? 'font-lj-mono uppercase tracking-[0.06em] lj-cta-bright'
                  : 'border border-[var(--color-lj-rule)] hover:bg-[var(--color-lj-cream-shade)]'
              }`}
            >
              <span aria-hidden="true">↓</span>
              {m.title} · PDF
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
