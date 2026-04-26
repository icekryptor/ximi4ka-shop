import { Container, Section, DisplayHeading, Button } from '@/components/ui'
import { Reveal } from '@/components/motion'

interface Props {
  title: string
  lead?: string
  cta: { label: string; href: string }
}

export function PreFooterCta({ title, lead, cta }: Props) {
  return (
    <Section size="lg" surface="gradient">
      <Container>
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <DisplayHeading
              as="h2"
              className="text-[var(--color-text-on-brand)]"
            >
              {title}
            </DisplayHeading>
            {lead && (
              <p className="max-w-2xl text-[length:var(--text-lead)] text-[var(--color-text-on-brand)] opacity-90">
                {lead}
              </p>
            )}
            <Button
              href={cta.href}
              variant="secondary"
              size="lg"
              className="bg-white text-[var(--color-brand)] border-white hover:bg-white hover:opacity-95"
            >
              {cta.label}
            </Button>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
