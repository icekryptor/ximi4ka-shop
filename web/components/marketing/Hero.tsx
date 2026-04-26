import type { Product } from '@ximi4ka-shop/shared'
import {
  Container,
  Section,
  Eyebrow,
  DisplayHeading,
  Button,
} from '@/components/ui'
import { Fade } from '@/components/motion'
import { GradientBlob, MoleculeMotif } from '@/components/decor'
import { HeroProductStack } from './HeroProductStack'

interface CtaProps {
  label: string
  href: string
}

interface Props {
  eyebrow: string
  title: string
  lead: string
  primaryCta: CtaProps
  secondaryCta?: CtaProps
  products?: Product[]
}

export function Hero({
  eyebrow,
  title,
  lead,
  primaryCta,
  secondaryCta,
  products = [],
}: Props) {
  return (
    <Section
      size="lg"
      surface="soft"
      className="relative overflow-hidden min-h-[70vh] md:min-h-[85vh] flex items-center"
    >
      {/* Decorative gradient blob clipped to right edge */}
      <GradientBlob className="pointer-events-none absolute -right-40 top-0 h-[140%] w-[60%] opacity-50" />

      {/* Decorative molecule motif behind the right column */}
      <MoleculeMotif className="pointer-events-none absolute right-8 top-1/2 h-[320px] w-[320px] -translate-y-1/2 opacity-20 hidden md:block" />

      <Container>
        <div className="relative z-10 grid gap-12 md:grid-cols-5 md:gap-16">
          {/* Left column — copy + CTAs (3/5 columns) */}
          <div className="md:col-span-3 flex flex-col justify-center">
            <Fade>
              <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
            </Fade>
            <Fade delay={0.05}>
              <DisplayHeading className="mb-6">{title}</DisplayHeading>
            </Fade>
            <Fade delay={0.1}>
              <p className="mb-8 max-w-prose text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
                {lead}
              </p>
            </Fade>
            <Fade delay={0.15}>
              <div className="flex flex-wrap gap-4">
                <Button href={primaryCta.href} size="lg">
                  {primaryCta.label}
                </Button>
                {secondaryCta && (
                  <Button
                    href={secondaryCta.href}
                    variant="secondary"
                    size="lg"
                  >
                    {secondaryCta.label}
                  </Button>
                )}
              </div>
            </Fade>
          </div>

          {/* Right column — product cutout collage (2/5 columns) */}
          <div className="md:col-span-2 relative min-h-[400px] md:min-h-[500px]">
            <HeroProductStack products={products} />
          </div>
        </div>
      </Container>
    </Section>
  )
}
