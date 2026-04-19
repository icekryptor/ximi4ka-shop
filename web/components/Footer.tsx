import Link from 'next/link'

interface FooterLink {
  href: string
  label: string
}

const shopLinks: FooterLink[] = [
  { href: '/categories', label: 'Каталог' },
  { href: '/', label: 'Все товары' },
]

const companyLinks: FooterLink[] = [
  { href: '/o-nas', label: 'О нас' },
  { href: '/dostavka', label: 'Доставка и оплата' },
  { href: '/kontakty', label: 'Контакты' },
]

const legalLinks: FooterLink[] = [
  { href: '#', label: 'Политика конфиденциальности' },
  { href: '#', label: 'Согласие на обработку данных' },
]

const socialLinks: FooterLink[] = [
  { href: '#', label: 'Telegram' },
  { href: '#', label: 'ВКонтакте' },
  { href: '#', label: 'Instagram' },
]

export function Footer() {
  return (
    <footer className="mt-16 border-t border-brand-border bg-brand-bg-soft">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <Link
              href="/"
              className="text-xl font-bold text-brand hover:text-brand-dark transition-colors"
            >
              Ximi4ka
            </Link>
            <p className="mt-3 text-sm text-brand-text-secondary">
              Наборы для химических экспериментов
            </p>
            <p className="mt-2 text-sm text-brand-text-secondary">Москва, Россия</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-brand-text mb-3">Магазин</h3>
              <ul className="space-y-2">
                {shopLinks.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-brand-text-secondary hover:text-brand-text transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-brand-text mb-3">Компания</h3>
              <ul className="space-y-2">
                {companyLinks.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-brand-text-secondary hover:text-brand-text transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-brand-text mb-3">Правовая</h3>
              <ul className="space-y-2">
                {legalLinks.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-brand-text-secondary hover:text-brand-text transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-brand-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-brand-text-secondary">
            © 2026 Ximi4ka. Все права защищены.
          </p>
          <ul className="flex items-center gap-4">
            {socialLinks.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="text-xs text-brand-text-secondary hover:text-brand-text transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
