import { NumberCell } from '@/components/ui/NumberCell'
import type { UseFact } from './extractKeyFacts'

interface Props { facts: UseFact[] }

export function CharacteristicsCellRow({ facts }: Props) {
  if (facts.length === 0) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {facts.map((f, i) => (
        <NumberCell
          key={f.key}
          index={pad(i + 1)}
          topLabel={f.label}
          big={f.big}
          bottomLeft={f.bottomLeft}
          bottomRight={f.bottomRight}
        />
      ))}
    </div>
  )
}
