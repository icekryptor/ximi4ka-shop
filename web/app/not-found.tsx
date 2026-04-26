import { Container, Section, Button } from '@/components/ui'
import { MoleculeMotif } from '@/components/decor'

export default function NotFound() {
  return (
    <Section size="lg" surface="base" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20"
      >
        <MoleculeMotif className="h-[600px] w-[600px]" variant="vivid" />
      </div>
      <Container>
        <div className="relative z-10 flex flex-col items-center text-center gap-6 py-16">
          <h1
            className="font-[var(--font-display)] tracking-[var(--tracking-tight)] leading-none text-[length:var(--text-display)] bg-clip-text text-transparent"
            style={{ backgroundImage: 'var(--gradient-brand)' }}
          >
            404
          </h1>
          <p className="text-[length:var(--text-h2)] font-[var(--font-display)] tracking-[var(--tracking-tight)] text-[var(--color-brand-text)]">
            Страница не найдена
          </p>
          <p className="max-w-md text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
            Возможно, страница была удалена или ссылка устарела.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button href="/" size="lg">
              На главную
            </Button>
            <Button href="/categories" variant="secondary" size="lg">
              В каталог
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  )
}
