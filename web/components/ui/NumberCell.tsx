import type { ReactNode } from 'react'

interface Props {
  index: string
  topLabel: string
  big: string
  bigVariant?: 'default' | 'decimal'
  bottomLeft?: string
  bottomRight?: string
  children?: ReactNode  // viz slot
}

export function NumberCell({
  index, topLabel, big, bigVariant = 'default',
  bottomLeft, bottomRight, children,
}: Props) {
  const tracking = bigVariant === 'decimal' ? 'tracking-[-0.06em]' : 'tracking-[-0.045em]'
  return (
    <div className="lj-num-cell relative overflow-hidden border border-[var(--color-lj-rule-on-ink)] p-5 pb-6 min-h-[18rem] flex flex-col justify-between gap-4 bg-[rgba(239,237,230,0.015)] transition-[background,border-color] duration-500 hover:bg-[rgba(131,110,254,0.06)] hover:border-[rgba(131,110,254,0.4)]">
      <span className="absolute top-0 left-0 right-0 h-px bg-[var(--color-lj-brand)] origin-left scale-x-0 transition-transform duration-[0.6s] [.lj-num-cell:hover_&]:scale-x-100" />
      <div className="flex justify-between items-center font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)]">
        <span>{index}</span>
        <span>{topLabel}</span>
      </div>
      <div className={`lj-num-cell-big font-lj-display font-[900] leading-none ${tracking} text-[clamp(2.5rem,4.8vw,4.25rem)] text-[var(--color-lj-bone)]`}>
        {big}
      </div>
      {children && <div className="flex items-center min-h-[36px] my-1">{children}</div>}
      {(bottomLeft || bottomRight) && (
        <div className="lj-num-cell-bottom flex justify-between gap-2 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)]">
          <span className="text-[var(--color-lj-brand)]">{bottomLeft}</span>
          <span>{bottomRight}</span>
        </div>
      )}
    </div>
  )
}
