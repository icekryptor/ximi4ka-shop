import { getElementOfDay } from '@/lib/elementOfDay'

// «Элемент дня» — Mendeleev-ячейка в футере (v3.5-пасхалка). Ховер/фокус
// раскрывает подпись чистым CSS (group-hover / focus-within), без JS.
// Server component: элемент детерминирован датой рендера (ISR revalidate
// держит его актуальным), см. lib/elementOfDay.ts.
export function ElementOfDayCell({ date }: { date?: Date }) {
  const el = getElementOfDay(date)
  return (
    <div className="group/eod relative inline-block" tabIndex={0} data-testid="element-of-day">
      {/* Ячейка: острые углы (Mendeleev-язык v3), brand-ховер */}
      <div
        aria-hidden="true"
        className="w-16 h-16 border border-[var(--color-lj-rule)] bg-transparent px-2 py-1.5 flex flex-col justify-between cursor-help transition-colors duration-300 group-hover/eod:border-[var(--color-lj-brand)] group-hover/eod:bg-[var(--color-lj-brand)]/5 group-focus-within/eod:border-[var(--color-lj-brand)]"
      >
        <span className="font-lj-mono text-[0.5625rem] leading-none opacity-60">
          {el.number}
        </span>
        <span className="font-lj-display font-[700] text-xl leading-none tracking-[-0.02em] text-[var(--color-lj-ink)] group-hover/eod:text-[var(--color-lj-brand-deep)] transition-colors duration-300">
          {el.symbol}
        </span>
        <span className="font-lj-mono text-[0.5rem] leading-none uppercase tracking-[0.06em] opacity-55 truncate">
          {el.name}
        </span>
      </div>
      {/* Подпись-тултип: раскрывается по hover/focus, доступна скринридеру */}
      <div
        role="note"
        className="pointer-events-none absolute bottom-[calc(100%+0.625rem)] right-0 z-[5] w-max max-w-[16rem] rounded-[var(--radius-lj-bright-sm)] bg-[image:var(--gradient-lj-bright)] px-4 py-3 text-left shadow-[var(--shadow-lj-bright)] opacity-0 translate-y-1 transition-[opacity,transform] duration-300 group-hover/eod:opacity-100 group-hover/eod:translate-y-0 group-focus-within/eod:opacity-100 group-focus-within/eod:translate-y-0"
      >
        <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright-mute)] mb-1">
          элемент дня · №{el.number}
        </p>
        <p className="font-lj-display font-[700] text-base leading-tight text-[var(--color-lj-on-bright)]">
          {el.name} ({el.symbol})
        </p>
        <p className="font-lj-body text-[0.8125rem] leading-snug text-[var(--color-lj-on-bright)] mt-1">
          {el.fact}
        </p>
      </div>
    </div>
  )
}
