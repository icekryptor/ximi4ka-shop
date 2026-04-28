'use client'

import { useEffect, useRef } from 'react'

interface Props {
  index: string
  label: string
  value: number
  fillPercent: number
}

export function StatBar({ index, label, value, fillPercent }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.style.width = `var(--w)`
        obs.disconnect()
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <li className="grid grid-cols-[minmax(7.5rem,auto)_1fr_2.5rem] items-center gap-3 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em]">
      <span className="text-[var(--color-lj-ink)] opacity-70 whitespace-nowrap">{index} / {label}</span>
      <span
        ref={ref}
        data-statbar
        className="block h-1.5 w-0 transition-[width] duration-[1.2s]"
        style={{
          '--w': `${fillPercent}%`,
          backgroundImage:
            'repeating-linear-gradient(90deg, var(--color-lj-ink) 0, var(--color-lj-ink) 4px, transparent 4px, transparent 6px)',
          backgroundSize: '6px 100%',
          backgroundRepeat: 'repeat-x',
          transitionTimingFunction: 'var(--ease-out-quart)',
        } as React.CSSProperties}
      />
      <span className="font-[var(--font-lj-display)] font-[700] text-[0.95rem] text-right tracking-[-0.02em] text-[var(--color-lj-ink)]">
        {value}
      </span>
    </li>
  )
}
