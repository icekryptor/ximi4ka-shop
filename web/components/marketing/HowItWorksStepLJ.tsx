import { NumberCell } from '@/components/ui/NumberCell'

interface Props {
  index: number  // 1-based
  verb: string   // big upper-case verb (e.g. "ВЫБРАТЬ")
  title: string  // step title (e.g. "Выберите набор")
  body: string   // description
}

export function HowItWorksStepLJ({ index, verb, title, body }: Props) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <NumberCell
      index={pad(index)}
      topLabel="шаг"
      big={verb}
      bottomLeft={`${index}.0`}
      bottomRight="процесс"
    >
      <div className="flex flex-col gap-2">
        <h3 className="font-lj-display font-[700] text-[1.125rem] leading-[1.15] tracking-[-0.02em] text-[var(--color-lj-bone)]">
          {title}
        </h3>
        <p className="font-lj-body text-[0.9375rem] leading-[1.5] text-[var(--color-lj-bone-mute)]">
          {body}
        </p>
      </div>
    </NumberCell>
  )
}
