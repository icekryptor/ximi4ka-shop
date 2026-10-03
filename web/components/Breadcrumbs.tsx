import Link from 'next/link'
import type { BreadcrumbItem } from '@/lib/jsonLd'

// Три готовых оформления — перенесены с прежних ручных <nav>, чтобы страницы
// выглядели как раньше. `content` — журнальные страницы (категория, блог,
// CMS), `catalog` — то же, но с трекингом из макета каталога, `product` —
// крошки карточки товара (Figma Breadcrumbs, колонки hero).
type Variant = 'content' | 'catalog' | 'product'

const STYLES: Record<
  Variant,
  { nav: string; ol: string; li: string; link: string; sep: string; current: string }
> = {
  content: {
    nav: 'max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70',
    ol: '',
    li: 'inline',
    link: 'hover:opacity-100',
    sep: 'mx-2',
    current: 'opacity-100 text-[var(--color-lj-brand-deep)]',
  },
  catalog: {
    nav: 'max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.03em] opacity-70',
    ol: '',
    li: 'inline',
    link: 'hover:opacity-100',
    sep: 'mx-2',
    current: 'opacity-100 text-[var(--color-lj-brand-deep)]',
  },
  product: {
    nav: 'box-content max-w-[1260px] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] leading-[1.5] uppercase tracking-[0.03em] text-[var(--color-lj-ink)] opacity-70',
    ol: 'flex flex-wrap gap-x-2',
    li: 'flex gap-x-2',
    link: 'hover:text-[var(--color-lj-brand)]',
    sep: '',
    current: '',
  },
}

interface Props {
  /** Цепочка от главной до текущей страницы; у последнего ссылки нет. */
  items: BreadcrumbItem[]
  variant?: Variant
}

export function Breadcrumbs({ items, variant = 'content' }: Props) {
  const s = STYLES[variant]
  return (
    <nav aria-label="breadcrumbs" className={s.nav}>
      <ol className={s.ol || undefined}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={`${i}-${item.name}`} className={s.li}>
              {isLast ? (
                <span aria-current="page" className={s.current || undefined}>
                  {item.name}
                </span>
              ) : item.href ? (
                <Link href={item.href} className={s.link}>
                  {item.name}
                </Link>
              ) : (
                <span>{item.name}</span>
              )}
              {!isLast && (
                <span className={s.sep || undefined} aria-hidden="true">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
