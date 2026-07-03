import { LabSection } from '@/components/ui/LabSection'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { NumberCell } from '@/components/ui/NumberCell'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { Timeline } from '@/components/dataviz/Timeline'
import { Scientific } from '@/components/dataviz/Scientific'
import { Rating } from '@/components/dataviz/Rating'
import { DotGrid } from '@/components/dataviz/DotGrid'

interface StatementPart { text: string; emphasis?: boolean }
interface Props {
  eyebrow: string
  statementParts: StatementPart[]
  body: string
}

export function Manifesto({ eyebrow, statementParts, body }: Props) {
  return (
    <LabSection variant="ink" id="manifesto" className="px-6 py-32">
      <GridOverlay surface="ink" />
      <NotebookHeader section="02" label="Манифест" page={2} total={3} />

      {/* Background ghost molecule */}
      <MoleculeMotifLJ
        variant="anthracene"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1] pointer-events-none text-[var(--color-lj-bone)] opacity-[0.05] [animation:lj-rotate-slow-reverse_200s_linear_infinite]"
        style={{ width: 'clamp(600px, 90vmin, 1100px)', height: 'clamp(600px, 90vmin, 1100px)' }}
      />

      <div className="relative z-[2] max-w-[var(--max-lj-narrow)] mx-auto">
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)] mb-12 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
          {eyebrow}
        </p>

        <h2 className="font-lj-display font-[700] text-[length:var(--text-lj-display)] leading-[1.0] tracking-[-0.04em] mb-16 max-w-[18ch]">
          {statementParts.map((p, i) =>
            p.emphasis ? (
              <em key={i} className="italic text-[var(--color-lj-brand)] font-[700] relative after:absolute after:content-[''] after:left-0 after:right-0 after:bottom-1 after:h-[5px] after:bg-[var(--color-lj-brand)] after:opacity-50 after:rounded-sm">
                {p.text}
              </em>
            ) : (
              <span key={i}>{p.text}</span>
            )
          )}
        </h2>

        <p className="max-w-[56ch] text-xl leading-[1.55] text-[rgba(239,237,230,0.78)] mb-24 pl-6 border-l border-[var(--color-lj-rule-on-ink)]">
          {body}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <NumberCell index="01" topLabel="год" big="2023" bottomLeft="основано" bottomRight="3 года">
            <Timeline points={['23', '24', '25', '26']} active={0} />
          </NumberCell>
          <NumberCell index="02" topLabel="купили" big="20 000+" bottomLeft="покупатели" bottomRight="с 2023">
            <Scientific mantissa="2" base="10" exponent="4" units="людей" />
          </NumberCell>
          <NumberCell index="03" topLabel="рейтинг" big="4,9" bigVariant="decimal" bottomLeft="из 5" bottomRight="WB & Ozon">
            <Rating value={4.9} max={5} />
          </NumberCell>
          <NumberCell index="04" topLabel="реакций" big="161" bottomLeft="в наборе" bottomRight="каждая ≠">
            <DotGrid total={161} cols={23} />
          </NumberCell>
        </div>
      </div>
    </LabSection>
  )
}
