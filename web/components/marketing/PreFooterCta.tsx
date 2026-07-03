import Link from 'next/link'
import { Container } from '@/components/ui'
import { LabSection } from '@/components/ui/LabSection'
import { Reveal } from '@/components/motion'

interface Props {
  title: string
  lead?: string
  cta: { label: string; href: string }
}

// v3.5: заголовок — bone Unbounded (v3-баг: DisplayHeading рендерил тёмный
// текст на ink-поверхности), CTA — яркая градиентная пилюля.
export function PreFooterCta({ title, lead, cta }: Props) {
  return (
    <LabSection variant="ink" className="px-6 py-32">
      <Container>
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.95] tracking-[-0.045em] text-[var(--color-lj-bone)]">
              {title}
            </h2>
            {lead && (
              <p className="max-w-2xl text-[length:var(--text-lead)] text-[var(--color-lj-bone-mute)]">
                {lead}
              </p>
            )}
            <Link
              href={cta.href}
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
            >
              {cta.label}
            </Link>
          </div>
        </Reveal>
      </Container>
    </LabSection>
  )
}
