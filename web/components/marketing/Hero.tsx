import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { HeroFigtag } from './HeroFigtag'
import { HeroScale } from './HeroScale'
import { HeroAnnotation } from './HeroAnnotation'
import { HeroDetailMolecule } from './HeroDetailMolecule'

interface CtaProps {
  label: string
  href: string
}

interface HeadlineRow {
  text: string
  emphasis?: boolean
  offset?: boolean
}

interface Props {
  eyebrow: string
  headlineRows: HeadlineRow[]
  trailLine: string
  lead: string
  primaryCta: CtaProps
  secondaryCta?: CtaProps
  tickerItems?: string[]
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
}: Props) {
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
      <HeroDetailMolecule variant="water" />

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

      <div className="relative z-[2] max-w-[var(--max-lj-content)] mx-auto w-full">
        <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-10 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
          {eyebrow}
        </p>

        <h1 className="font-[var(--font-lj-display)] font-[900] text-[length:var(--text-lj-mega)] leading-[0.88] tracking-[-0.045em] uppercase mb-10 relative z-[2]">
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
          <span className="block font-[var(--font-lj-mono)] font-normal text-[clamp(0.875rem,1vw,1.125rem)] normal-case tracking-[0.02em] opacity-55 mt-6 pl-[9vw] max-w-[36ch] leading-snug">
            {trailLine}
          </span>
        </h1>

        <p className="max-w-[540px] text-xl leading-snug opacity-78 mb-12 relative z-[2]">
          {lead}
        </p>

        <div className="flex gap-4 items-center flex-wrap relative z-[2]">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center gap-3 px-7 py-4 font-[var(--font-lj-mono)] text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-400 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]"
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
              className="inline-flex items-center gap-3 px-7 py-4 font-[var(--font-lj-mono)] text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-transparent text-[var(--color-lj-ink)] transition-all duration-400 hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)]"
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
          className="flex gap-12 whitespace-nowrap font-[var(--font-lj-mono)] text-[0.8125rem] uppercase tracking-[0.08em] [animation:lj-ticker_50s_linear_infinite] pl-12 shrink-0"
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
