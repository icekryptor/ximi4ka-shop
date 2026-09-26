import { LabSection } from '@/components/ui/LabSection'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { NumberCell } from '@/components/ui/NumberCell'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { Timeline } from '@/components/dataviz/Timeline'
import { Scientific } from '@/components/dataviz/Scientific'
import { Rating } from '@/components/dataviz/Rating'
import { DotGrid } from '@/components/dataviz/DotGrid'

interface StatementPart {
  text: string
  emphasis?: boolean
}
interface Props {
  statementParts: StatementPart[]
  body: string
}

export function Manifesto({ statementParts, body }: Props) {
  return (
    <LabSection variant="ink" id="manifesto" className="px-6 py-32">
      <GridOverlay surface="ink" />

      {/* Background ghost molecule */}
      <MoleculeMotifLJ
        variant="anthracene"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1] pointer-events-none text-[var(--color-lj-bone)] opacity-[0.05] [animation:lj-rotate-slow-reverse_200s_linear_infinite]"
        style={{ width: 'clamp(600px, 90vmin, 1100px)', height: 'clamp(600px, 90vmin, 1100px)' }}
      />

      <div className="relative z-[2] max-w-[var(--max-lj-narrow)] mx-auto">
        <h2 className="font-lj-display font-[700] text-[length:var(--text-lj-display)] leading-[1.0] tracking-[-0.04em] mb-16 max-w-[18ch]">
          {statementParts.map((p, i) =>
            p.emphasis ? (
              <em
                key={i}
                className="italic text-[var(--color-lj-brand)] font-[700] relative after:absolute after:content-[''] after:left-0 after:right-0 after:bottom-1 after:h-[5px] after:bg-[var(--color-lj-brand)] after:opacity-50 after:rounded-sm"
              >
                {p.text}
              </em>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </h2>

        <p className="max-w-[56ch] text-xl leading-[1.55] text-[rgba(239,237,230,0.78)] mb-24 pl-6 border-l border-[var(--color-lj-rule-on-ink)]">
          {body}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <NumberCell
            index="01"
            topLabel="год"
            big="2023"
            bottomLeft="основано"
            bottomRight="3 года"
          >
            <Timeline points={['23', '24', '25', '26']} active={0} />
          </NumberCell>
          <NumberCell
            index="02"
            topLabel="купили"
            big="20 000+"
            bottomLeft="покупатели"
            bottomRight="с 2023"
          >
            <Scientific mantissa="2" base="10" exponent="4" units="людей" />
          </NumberCell>
          <NumberCell
            index="03"
            topLabel="рейтинг"
            big="4,9"
            bottomLeft="из 5"
            bottomRight="WB & Ozon"
          >
            <Rating value={4.9} max={5} />
          </NumberCell>
          <NumberCell
            index="04"
            topLabel="реакций"
            big="161"
            bottomLeft="в наборе"
            bottomRight="каждая ≠"
          >
            <DotGrid total={161} cols={23} />
          </NumberCell>
        </div>
      </div>
    </LabSection>
  )
}
