import { HeaderLogo } from './HeaderLogo'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'

const ROW_OT = ['Химичка', 'с 2023', 'Москва', '161 опыт', '⌀ 4.9/5']
const ROW_SVYAZ = ['telegram', 'whatsapp', 'phone', 'email']
const ROW_STRANITSY = ['каталог', 'о нас', 'доставка', 'оплата', 'возврат']

interface ColophonRowProps {
  label: string
  items: string[]
  className?: string
}

function ColophonRow({ label, items, className = '' }: ColophonRowProps) {
  return (
    <div className={`grid grid-cols-[5rem_1fr] gap-6 items-baseline ${className}`}>
      <span className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-brand)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] tracking-[0.04em] text-[var(--color-lj-ink)] opacity-80">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="inline-flex items-center gap-3">
            {item}
            {i < items.length - 1 && <span className="text-[var(--color-lj-brand)]">·</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="relative bg-[var(--color-lj-cream)] border-t border-[var(--color-lj-rule)] px-6 py-16 overflow-hidden">
      <MoleculeMotifLJ
        variant="methane"
        className="absolute right-8 bottom-8 w-12 h-12 text-[var(--color-lj-ink)] opacity-40"
      />

      <div className="max-w-[var(--max-lj-content)] mx-auto relative z-[2]">
        <div className="flex items-center justify-between font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] mb-12 pb-4 border-b border-[var(--color-lj-rule)]">
          <span className="inline-flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lj-brand)]" />
            СТР. ZZ / END · ЛАБОРАТОРНЫЙ ЖУРНАЛ
          </span>
          <span className="opacity-70">Ред. 2026.04 · v3</span>
        </div>

        <ColophonRow label="ОТ" items={ROW_OT} className="mb-8" />
        <ColophonRow label="СВЯЗЬ" items={ROW_SVYAZ} className="mb-8" />
        <ColophonRow label="СТРАНИЦЫ" items={ROW_STRANITSY} className="mb-16" />

        <div className="border-t border-[var(--color-lj-rule)] pt-12 flex items-end justify-between gap-8 flex-wrap">
          <HeaderLogo size={4} className="text-[var(--color-lj-ink)]" />
          <span className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70">
            © 2023–2026 · все права защищены
          </span>
        </div>
      </div>
    </footer>
  )
}
