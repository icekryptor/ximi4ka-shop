interface FaqItem { q: string; a: string }
interface Props { items: FaqItem[] }

/**
 * Native <details>/<summary> accordion styled v3. Zero JS.
 * Mono uppercase question, italic answer, brand-purple +/- indicator.
 *
 * The +/- swap uses Tailwind's `group-open/faq:` selector — when the parent
 * <details> is open, the + becomes hidden and the − becomes visible.
 */
export function FaqAccordion({ items }: Props) {
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-0 border-t border-[var(--color-lj-rule)]">
      {items.map((item, i) => (
        <li key={i} className="border-b border-[var(--color-lj-rule)]">
          <details className="group/faq relative">
            <summary className="cursor-pointer font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] py-5 pr-12 list-none [&::-webkit-details-marker]:hidden flex items-start justify-between gap-4 hover:text-[var(--color-lj-brand-deep)] transition-colors">
              <span className="font-lj-mono">{item.q}</span>
              <span aria-hidden="true" className="font-lj-mono text-[var(--color-lj-brand)] text-base group-open/faq:hidden">+</span>
              <span aria-hidden="true" className="font-lj-mono text-[var(--color-lj-brand)] text-base hidden group-open/faq:inline">−</span>
            </summary>
            <p className="italic text-[1.0625rem] leading-[1.55] text-[var(--color-lj-ink)] opacity-80 pb-6 pr-12 max-w-[60ch]">
              {item.a}
            </p>
          </details>
        </li>
      ))}
    </ul>
  )
}
