import type { MaterialKind } from '@ximi4ka-shop/shared'

export interface MaterialItem {
  id: string
  title: string
  kind: MaterialKind
  url?: string
}

// Ссылки на электронные материалы. Файл скачивается через API (hrefFor), внешняя
// ссылка открывается в новой вкладке. `dark` — страница заказа на тёмном фоне,
// `light` — раздел кабинета.
export function MaterialsDownloads({
  items,
  hrefFor,
  tone = 'dark',
  heading = 'Ваши материалы',
}: Readonly<{
  items: MaterialItem[]
  hrefFor: (id: string) => string
  tone?: 'dark' | 'light'
  heading?: string | null
}>) {
  if (items.length === 0) return null
  const dark = tone === 'dark'
  return (
    <section data-testid="materials" className="flex flex-col gap-3">
      {heading && (
        <h2
          className={`m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] ${
            dark ? 'text-[var(--color-lj-bone-mute)]' : 'opacity-60'
          }`}
        >
          {heading}
        </h2>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((m) => {
          const external = m.kind === 'link' && Boolean(m.url)
          return (
            <li key={m.id}>
              <a
                href={external ? m.url : hrefFor(m.id)}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 ${
                  dark
                    ? 'font-lj-mono uppercase tracking-[0.06em] lj-cta-bright'
                    : 'border border-[var(--color-lj-rule)] hover:bg-[var(--color-lj-cream-shade)]'
                }`}
              >
                <span aria-hidden="true">{external ? '↗' : '↓'}</span>
                {m.title}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
