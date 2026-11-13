import Link from 'next/link'
import { BLACK_FRIDAY } from '@/lib/blackFriday'

/**
 * Лента «Чёрной пятницы» над шапкой — на всех страницах витрины в даты акции.
 * Чёрная полоса с бегущей строкой между двумя сигнальными кромками; вся лента —
 * одна ссылка в наборы. Скринридеру читается один раз (aria-label), бегущий
 * текст от него скрыт.
 */
export function BlackFridayStrip() {
  // Два одинаковых набора фраз: дорожка сдвигается на −50% и зацикливается без шва.
  const items = [...BLACK_FRIDAY.tapeItems, ...BLACK_FRIDAY.tapeItems]
  const doubled = [...items, ...items]
  return (
    <Link
      href={BLACK_FRIDAY.href}
      aria-label={`${BLACK_FRIDAY.titleLines.join(' ')} ${BLACK_FRIDAY.lead}`}
      className="group/bf relative block overflow-hidden bg-[var(--bf-black)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bf-yellow)]"
    >
      <span aria-hidden="true" className="bf-stripes block h-[5px] [--bf-stripe:7px]" />
      <span
        aria-hidden="true"
        className="animate-ticker-scroll flex whitespace-nowrap py-2 group-hover/bf:[animation-play-state:paused]"
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="mx-5 inline-flex items-center gap-10 font-lj-mazzard text-[0.8125rem] font-[700] uppercase tracking-[0.1em]"
          >
            <span className={i % 2 === 0 ? 'bf-fire-text' : 'bf-white-glow'}>{item}</span>
            <span className="text-[var(--bf-yellow)]">⚠</span>
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="bf-stripes block h-[5px] [--bf-stripe:7px]" />
    </Link>
  )
}
