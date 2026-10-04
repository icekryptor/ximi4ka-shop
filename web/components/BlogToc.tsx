import { shouldShowToc, type TocItem } from '@/lib/articleToc'

interface Props {
  items: TocItem[]
}

/**
 * Оглавление статьи: якоря на h2/h3 из текста (id проставляет
 * lib/articleToc.ts). Меньше трёх заголовков — оглавления нет. h3
 * сдвинуты вправо как вложенные пункты.
 */
export function BlogToc({ items }: Props) {
  if (!shouldShowToc(items)) return null
  return (
    <nav
      aria-label="Содержание"
      className="max-w-3xl mb-10 border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream-shade)] p-6"
    >
      <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-60 mb-3">
        Содержание
      </p>
      <ol className="space-y-2 text-[0.9375rem] leading-[1.4]">
        {items.map((item) => (
          <li key={item.id} data-level={item.level} className={item.level === 3 ? 'pl-5' : ''}>
            <a
              href={`#${item.id}`}
              className="underline underline-offset-4 decoration-[var(--color-lj-rule)] hover:text-[var(--color-lj-brand-deep)] hover:decoration-current"
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
