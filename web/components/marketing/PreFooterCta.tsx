import Link from 'next/link'
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
            <Link
              href={cta.href}
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-bone)] rounded-full bg-transparent text-[var(--color-lj-bone)] transition-all duration-400 hover:bg-[var(--color-lj-bone)] hover:text-[var(--color-lj-ink)]"
            >
              {cta.label}
            </Link>
          </div>
        </Reveal>
      </Container>
    </LabSection>
  )
}
