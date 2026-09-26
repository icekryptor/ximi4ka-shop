import type { ReactNode } from 'react'

interface Props {
  index: string
  topLabel?: string
  big: string
  bottomLeft?: string
  bottomRight?: string
  children?: ReactNode // viz slot
}

// Оболочка тёмной ячейки (рамка, фон, подсветка при наведении) — общая с
// шагом «Как это работает» (HowItWorksStepLJ).
export const LAB_CELL =
  'lj-num-cell relative overflow-hidden border border-[var(--color-lj-rule-on-ink)] bg-[rgba(239,237,230,0.015)] transition-[background,border-color] duration-500 hover:bg-[rgba(131,110,254,0.06)] hover:border-[rgba(131,110,254,0.4)]'

export function LabCellHoverLine() {
  return (
    <span className="absolute top-0 left-0 right-0 h-px bg-[var(--color-lj-brand)] origin-left scale-x-0 transition-transform duration-[0.6s] [.lj-num-cell:hover_&]:scale-x-100" />
  )
}

// Тёмная карточка-факт (Figma «Карточки / StatCard»): метки сверху и снизу —
// Mazzard Bold 14, большое значение — Mazzard ExtraLight 40 вместе с графикой.
// Высота 288 на мобильном и 313 с md, как в макете.
export function NumberCell({ index, topLabel, big, bottomLeft, bottomRight, children }: Props) {
  return (
    <div
      className={`${LAB_CELL} p-5 pb-6 md:pb-5 min-h-[18rem] md:min-h-[19.5625rem] flex flex-col justify-between gap-4`}
    >
      <LabCellHoverLine />
      <div className="flex justify-between items-center gap-2 font-lj-mazzard font-bold text-sm leading-[1.18] text-[var(--color-lj-bone-mute)]">
        <span>{index}</span>
        {topLabel && <span>{topLabel}</span>}
      </div>
      <div className="flex flex-col gap-10">
        <div className="lj-num-cell-big font-lj-mazzard font-extralight text-[2.5rem] leading-10 md:leading-[4.25rem] tracking-[-0.045em] text-[var(--color-lj-bone)]">
          {big}
        </div>
        {children && <div className="flex items-center min-h-[36px]">{children}</div>}
      </div>
      {(bottomLeft || bottomRight) && (
        <div className="lj-num-cell-bottom flex justify-between gap-2 font-lj-mazzard font-bold text-sm leading-[1.18] text-[var(--color-lj-bone-mute)]">
          <span className="text-[var(--color-lj-brand)]">{bottomLeft}</span>
          <span>{bottomRight}</span>
        </div>
      )}
    </div>
  )
}
