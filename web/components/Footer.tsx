import Link from 'next/link'
import { MoleculeMotif } from '@/components/decor'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'

interface FooterColumn {
  heading: string
  links: { href: string; label: string }[]
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Магазин',
    links: [{ href: '/categories', label: 'Каталог' }],
  },
  {
    heading: 'Компания',
    links: [
      { href: '/o-nas', label: 'О нас' },
      { href: '/dostavka', label: 'Доставка и оплата' },
      { href: '/kontakty', label: 'Контакты' },
    ],
  },
  {
    heading: 'Правовое',
    links: [
      { href: '#', label: 'Политика конфиденциальности' },
      { href: '#', label: 'Согласие на обработку данных' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-soft)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="relative md:col-span-1 flex flex-col gap-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-8 -top-8 -z-10 h-[200px] w-[200px] opacity-20"
            >
              <MoleculeMotif variant="vivid" />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-extrabold tracking-[var(--tracking-tight)] text-[var(--color-brand-text)]">
                Ximi4ka
              </span>
              <MoleculeMotifLJ
                variant="methane"
                className="w-12 h-12 text-[var(--color-lj-ink)] opacity-40"
              />
            </div>
            <p className="text-[length:var(--text-small)] text-[var(--color-brand-text-secondary)]">
              Наборы для химических экспериментов
            </p>
            <div
              aria-hidden="true"
              className="h-[2px] w-[60px] mt-1"
              style={{ background: 'var(--gradient-brand)' }}
            />
            <p className="mt-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Москва, Россия
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <h3 className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wider text-[var(--color-brand-text-secondary)]">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[length:var(--text-small)] text-[var(--color-brand-text)] hover:text-[var(--color-brand)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[length:var(--text-micro)] text-[var(--color-text-muted)]">
            © 2026 Ximi4ka. Все права защищены.
          </p>
          <span
            aria-label="Язык: русский"
            className="text-[length:var(--text-micro)] text-[var(--color-text-muted)]"
          >
            RU
          </span>
        </div>
      </div>
    </footer>
  )
}
