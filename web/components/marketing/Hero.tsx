import Image from 'next/image'
import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { HeroFigtag } from './HeroFigtag'
import { HeroScale } from './HeroScale'
import { HeroAnnotation } from './HeroAnnotation'
import { HeroDetailMolecule } from './HeroDetailMolecule'
import { HeroSlider } from './HeroSlider'
import type { HeroSlide } from '@/lib/heroSlides'

interface CtaProps {
  label: string
  href: string
}

interface HeadlineRow {
  text: string
  emphasis?: boolean
  offset?: boolean
}

interface VisualProps {
  imageUrl: string
  alt: string
  href: string
  label?: string
}

interface Props {
  eyebrow: string
  headlineRows: HeadlineRow[]
  trailLine: string
  lead: string
  primaryCta: CtaProps
  secondaryCta?: CtaProps
  tickerItems?: string[]
  /**
   * v3.5: яркая градиентная панель с фото флагманского продукта (скрыта < lg).
   * Legacy-путь — одна статичная карточка. Если передан `slides`, он в приоритете.
   */
  visual?: VisualProps
  /**
   * v3.5: переключаемый слайдер флагманских наборов (стрелки/точки/свайп).
   * Каждый слайд — реальный DB-продукт с фото, ценой и CTA. Скрыт < lg.
   */
  slides?: HeroSlide[]
}

const DEFAULT_TICKER = [
  'H₂O · вода',
  'NaCl · соль',
  'CuSO₄ · медь',
  'pH 7.0 · нейтрально',
  'C₆H₁₂O₆ · глюкоза',
  'HCl · соляная',
  'Fe + S → FeS',
  'NH₃ · аммиак',
  '2 H₂O₂ → 2 H₂O + O₂',
  'K · калий',
]

export function Hero({
  eyebrow,
  headlineRows,
  trailLine,
  lead,
  primaryCta,
  secondaryCta,
  tickerItems = DEFAULT_TICKER,
  visual,
  slides,
}: Props) {
  const hasSlider = !!slides && slides.length > 0
  // Слайдер имеет приоритет; но композиция «карточка-герой справа»
  // управляется любым из двух источников — от этого зависит размер заголовка.
  const hasVisual = hasSlider || !!visual
  return (
    <LabSection
      variant="cream"
      className="min-h-screen px-6 pt-24 pb-20 flex flex-col justify-center"
    >
      <GridOverlay />
      <NotebookHeader
        section="001"
        label="Лабораторный журнал"
        page={1}
        total={3}
        edition="Ред. 2026.04 / v3"
      />
      <HeroFigtag figNumber="001-A" arr="C₆H₆" />
      <div className="lj-drift absolute inset-0 pointer-events-none" aria-hidden="true">
        <HeroDetailMolecule variant="water" />
      </div>

      {/* Pinned rotating benzene */}
      <MoleculeMotifLJ
        variant="benzene"
        className="absolute z-[1] pointer-events-none text-[var(--color-lj-ink)] [animation:lj-rotate-slow_80s_linear_infinite] [mix-blend-mode:multiply]"
        style={{
          top: '48%',
          right: '-10vw',
          transform: 'translateY(-50%)',
          width: 'clamp(360px, 52vh, 620px)',
          height: 'clamp(360px, 52vh, 620px)',
          opacity: 0.42,
        }}
      />

      {hasSlider ? (
        <div className="hidden lg:block absolute z-[3] right-[4vw] top-1/2 -translate-y-1/2">
          <HeroSlider slides={slides!} />
        </div>
      ) : (
        visual && (
          <Link
            href={visual.href}
            aria-label={visual.alt}
            className="hidden lg:block absolute z-[3] right-[4vw] top-1/2 -translate-y-1/2 w-[clamp(300px,24vw,420px)] aspect-[4/5] rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] overflow-hidden lj-lift"
          >
            <span className="absolute top-5 left-6 z-[2] font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright-mute)]">
              {visual.label ?? 'fig. 001 — флагман'}
            </span>
            <Image
              src={visual.imageUrl}
              alt={visual.alt}
              fill
              priority
              sizes="(max-width: 1024px) 0px, 24vw"
              className="object-contain p-8 pt-14 drop-shadow-[0_24px_32px_rgba(60,20,120,0.35)] transition-transform duration-700 hover:scale-[1.04]"
            />
            <span className="absolute bottom-5 left-6 right-6 z-[2] font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright)] inline-flex items-center gap-2">
              смотреть набор →
            </span>
          </Link>
        )
      )}

      <div className="relative z-[2] max-w-[var(--max-lj-content)] mx-auto w-full">
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-10 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
          {eyebrow}
        </p>

        <h1
          className={`font-lj-display font-[900] ${hasVisual ? 'text-[clamp(2.5rem,5vw,5.5rem)] lg:max-w-[52vw]' : 'text-[length:var(--text-lj-mega)]'} leading-[0.9] tracking-[-0.045em] uppercase mb-10 relative z-[2]`}
        >
          {headlineRows.map((row, i) => (
            <span key={i} className={`block ${row.offset ? 'pl-[9vw]' : ''}`}>
              {row.emphasis ? (
                <em className="lj-headline-emphasis text-[var(--color-lj-brand)] italic font-[900]">
                  {row.text}
                </em>
              ) : (
                row.text
              )}
            </span>
          ))}
        </h1>
        <p className="block font-lj-mono font-normal text-[clamp(0.875rem,1vw,1.125rem)] normal-case tracking-[0.02em] opacity-55 -mt-4 mb-10 pl-[9vw] max-w-[36ch] leading-snug">
          {trailLine}
        </p>

        <p className="max-w-[540px] text-xl leading-snug opacity-78 mb-12 relative z-[2]">{lead}</p>

        <div className="flex gap-4 items-center flex-wrap relative z-[2]">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
          >
            {primaryCta.label}
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path
                d="M2 8h12M9 3l5 5-5 5"
                stroke="currentColor"
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-transparent text-[var(--color-lj-ink)] transition-all duration-400 hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)]"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>

      <HeroScale caption="scale 1 : 1 · 200 mm" />
      <HeroAnnotation primary="рабочая область" secondary="1080 × 1920 mm" />

      {/* Ticker */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] overflow-hidden h-14 flex items-center z-[4]">
        <div
          className="flex gap-12 whitespace-nowrap font-lj-mono text-[0.8125rem] uppercase tracking-[0.08em] [animation:lj-ticker_50s_linear_infinite] pl-12 shrink-0"
          aria-hidden="true"
        >
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3.5 shrink-0">
              <span className="w-1 h-1 rounded-full bg-[var(--color-lj-brand)]" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </LabSection>
  )
}
