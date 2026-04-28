import { Container, DarkSection, DisplayHeading, BigNumber } from '@/components/ui'

interface BigNumberStat {
  value: number | string
  label: string
  prefix?: string
  suffix?: string
}

interface Props {
  eyebrow?: string
  title?: string
  lead?: string
  stats?: BigNumberStat[]
}

const DEFAULT_STATS: BigNumberStat[] = [
  { value: 9, label: 'лет на рынке' },
  { value: '15000+', label: 'счастливых семей' },
  { value: 48, label: 'наборов и реактивов' },
  { value: 161, label: 'опыт в одном наборе' },
]

const DEFAULT_LEAD =
  'Безопасно. Образовательно. Сертифицировано. Создаём наборы для химических экспериментов с 2017 года.'

export function Manifesto({
  eyebrow = 'О нас',
  title = 'Что такое Химичка',
  lead = DEFAULT_LEAD,
  stats = DEFAULT_STATS,
}: Props) {
  return (
    <DarkSection size="lg" glow>
      <Container>
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="uppercase tracking-wider text-[length:var(--text-micro)] font-semibold text-[var(--color-accent)]">
            {eyebrow}
          </span>
          <DisplayHeading
            as="h2"
            className="!text-[var(--color-text-on-dark)]"
          >
            {title}
          </DisplayHeading>
          <p className="max-w-2xl text-[length:var(--text-lead)] text-[var(--color-text-muted-on-dark)]">
            {lead}
          </p>
        </div>

        {stats.length > 0 && (
          <div className="mt-16 grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-8">
            {stats.map((stat, i) => (
              <BigNumber
                key={i}
                value={stat.value}
                label={stat.label}
                prefix={stat.prefix}
                suffix={stat.suffix}
              />
            ))}
          </div>
        )}
      </Container>
    </DarkSection>
  )
}
