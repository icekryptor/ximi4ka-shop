import { Container, DisplayHeading } from '@/components/ui'
import { LabSection } from '@/components/ui/LabSection'
import { Reveal } from '@/components/motion'

interface Props {
  title: string
  lead?: string
  cta: { label: string; href: string }
}

export function PreFooterCta({ title, lead, cta }: Props) {
  return (
    <LabSection variant="ink" className="px-6 py-32">
      <Container>
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <DisplayHeading as="h2">{title}</DisplayHeading>
            {lead && (
              <p className="max-w-2xl text-[length:var(--text-lead)] text-[var(--color-text-muted-on-dark)]">
                {lead}
              </p>
            )}
            <a
              href={cta.href}
              className="inline-flex items-center justify-center rounded-full bg-[var(--gradient-accent)] px-10 py-4 text-[length:var(--text-lead)] font-semibold text-white shadow-[var(--shadow-glow-brand)] transition hover:opacity-95"
            >
              {cta.label}
            </a>
          </div>
        </Reveal>
      </Container>
    </LabSection>
  )
}
