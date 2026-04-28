import Link from 'next/link'
import type { Product } from '@ximi4ka-shop/shared'
import { Container, DarkSection, Ticker } from '@/components/ui'
import { Fade } from '@/components/motion'
import { MoleculeMotif } from '@/components/decor'
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
  emphasisWord?: string
  tickerItems?: string[]
}

const DEFAULT_TICKER_ITEMS = [
  'Доставка по России',
  'Безопасно для детей',
  'Сертифицировано',
  '17+ опытов',
  '161 эксперимент',
  'Методичка в комплекте',
]

function renderTitle(title: string, emphasisWord?: string) {
  if (!emphasisWord) return title
  const idx = title.indexOf(emphasisWord)
  if (idx === -1) return title
  const prefix = title.slice(0, idx)
  const suffix = title.slice(idx + emphasisWord.length)
  return (
    <>
      {prefix}
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: 'var(--gradient-accent)' }}
      >
        {emphasisWord}
      </span>
      {suffix}
    </>
  )
}

export function Hero({
  eyebrow,
  title,
  lead,
  primaryCta,
  secondaryCta,
  products = [],
  emphasisWord,
  tickerItems = DEFAULT_TICKER_ITEMS,
}: Props) {
  return (
    <DarkSection size="lg" glow className="relative">
      {/* Decorative drifting molecule motif behind everything */}
      <MoleculeMotif
        variant="vivid"
        className="pointer-events-none absolute -right-32 top-1/3 h-[640px] w-[640px] opacity-10 hidden md:block"
      />

      <Container>
        <div className="relative z-10 grid gap-12 md:grid-cols-5 md:gap-16">
          {/* Left column — copy + CTAs (3/5 columns) */}
          <div className="md:col-span-3 flex flex-col justify-center">
            <Fade>
              <span className="mb-4 inline-block uppercase tracking-wider text-[length:var(--text-micro)] font-semibold text-[var(--color-accent)]">
                {eyebrow}
              </span>
            </Fade>
            <Fade delay={0.05}>
              <h1 className="mb-6 font-[var(--font-display)] tracking-[var(--tracking-mega)] leading-[0.9] text-[length:var(--text-mega)] text-[var(--color-text-on-dark)]">
                {renderTitle(title, emphasisWord)}
              </h1>
            </Fade>
            <Fade delay={0.1}>
              <p className="mb-8 max-w-prose text-[length:var(--text-lead)] text-[var(--color-text-muted-on-dark)]">
                {lead}
              </p>
            </Fade>
            <Fade delay={0.15}>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={primaryCta.href}
                  className="inline-flex items-center justify-center rounded-full px-10 py-4 text-[length:var(--text-lead)] font-semibold text-[var(--color-text-on-brand)] shadow-[var(--shadow-glow-brand)] transition hover:opacity-95"
                  style={{ backgroundImage: 'var(--gradient-brand-deep)' }}
                >
                  {primaryCta.label}
                </Link>
                {secondaryCta && (
                  <Link
                    href={secondaryCta.href}
                    className="inline-flex items-center justify-center rounded-full border-2 border-[var(--color-accent)] px-10 py-4 text-[length:var(--text-lead)] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-white"
                  >
                    {secondaryCta.label}
                  </Link>
                )}
              </div>
            </Fade>
          </div>

          {/* Right column — product stack (2/5 columns) */}
          <div className="md:col-span-2 relative min-h-[400px] md:min-h-[500px]">
            <HeroProductStack products={products} />
          </div>
        </div>
      </Container>

      {/* Bottom ticker strip */}
      <div className="relative z-10 mt-16 -mb-32">
        <Ticker items={tickerItems} surface="accent" />
      </div>
    </DarkSection>
  )
}
