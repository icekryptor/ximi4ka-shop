import { LAB_CELL, LabCellHoverLine } from '@/components/ui/NumberCell'

interface Props {
  index: number // 1-based
  verb: string // big upper-case verb (e.g. "ВЫБРАТЬ")
  title: string // step title (e.g. "Выберите набор")
  body: string // description
}

// Шаг «Как это работает» (Figma «Карточки / StepCard»): та же тёмная ячейка
// (LAB_CELL), что у NumberCell, но без нижних меток и без растяжки по высоте:
// номер, через 24px приглушённый глагол, под ним заголовок и текст. Высоту в
// ряду выравнивает сетка. Строка глагола на десктопе 68px в блоке 47px, как в
// макете: глагол садится ниже номера, заголовок подтягивается к нему.
export function HowItWorksStepLJ({ index, verb, title, body }: Props) {
  return (
    <div className={`${LAB_CELL} p-5 flex flex-col gap-6`}>
      <LabCellHoverLine />
      <span className="font-lj-mazzard font-bold text-sm leading-[1.18] text-[var(--color-lj-bone-mute)]">
        {String(index).padStart(2, '0')}
      </span>
      <div className="flex flex-col gap-5">
        {/* Глагол декоративный — смысл несёт заголовок под ним. */}
        <div
          aria-hidden="true"
          className="lj-num-cell-big font-lj-mazzard font-extralight text-[2.5rem] leading-10 tracking-[-0.045em] text-[var(--color-lj-bone)] opacity-50 md:h-[2.964rem] md:leading-[4.25rem] md:opacity-30"
        >
          {verb}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-lj-mazzard text-[1.125rem] leading-[1.15] tracking-[-0.02em] text-[var(--color-lj-bone)]">
            {title}
          </h3>
          <p className="font-lj-body text-[0.9375rem] leading-[1.5] text-[var(--color-lj-bone-mute)]">
            {body}
          </p>
        </div>
      </div>
    </div>
  )
}
