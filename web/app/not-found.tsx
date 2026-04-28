import Link from 'next/link'
import { Container } from '@/components/ui'
import { LabSection } from '@/components/ui/LabSection'
import { MoleculeMotif } from '@/components/decor'

export default function NotFound() {
  return (
    <LabSection variant="ink" className="px-6 py-32">
      {/* Decorative motif sits BEHIND the numeral on a low z-index. The
          motif is positioned absolutely with `z-0` and the foreground content
          uses `relative z-10` to stay above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-30"
      >
        <MoleculeMotif className="h-[820px] w-[820px]" variant="vivid" />
      </div>
      <Container>
        <div className="flex flex-col items-center text-center gap-6 py-16">
          <h1
            className="font-[var(--font-display)] tracking-[var(--tracking-tight)] leading-none text-[length:var(--text-mega)] bg-clip-text text-transparent"
            style={{ backgroundImage: 'var(--gradient-accent)' }}
          >
            404
          </h1>
          <p className="text-[length:var(--text-h2)] font-[var(--font-display)] tracking-[var(--tracking-tight)] text-[var(--color-text-on-dark)]">
            Страница не найдена
          </p>
          <p className="max-w-md text-[length:var(--text-lead)] text-[var(--color-text-muted-on-dark)]">
            Возможно, страница была удалена или ссылка устарела.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full px-10 py-4 text-[length:var(--text-lead)] font-semibold text-white shadow-[var(--shadow-md)] transition hover:opacity-95"
              style={{ backgroundImage: 'var(--gradient-accent)' }}
            >
              На главную
            </Link>
            <Link
              href="/categories"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/80 px-10 py-4 text-[length:var(--text-lead)] font-semibold text-white transition hover:bg-white hover:text-[var(--color-dark-base)]"
            >
              В каталог
            </Link>
          </div>
        </div>
      </Container>
    </LabSection>
  )
}
