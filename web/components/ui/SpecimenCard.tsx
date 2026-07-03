import { DashedRectMark } from './illustrations/DashedRectMark'
import { HandDrawnArrow } from './illustrations/HandDrawnArrow'

interface Props {
  sku: string
  size: 'card' | 'pdp'
  className?: string
}

export function SpecimenCard({ sku, size, className = '' }: Props) {
  const aspectClass = size === 'card' ? 'aspect-[4/5]' : 'aspect-square'
  const eyebrowClass =
    size === 'card'
      ? 'text-[length:var(--text-lj-mono-xs)] tracking-[0.08em]'
      : 'text-[length:var(--text-lj-mono-sm)] tracking-[0.1em]'
  const captionClass =
    size === 'card'
      ? 'text-[length:var(--text-lj-mono-sm)] tracking-[0.04em]'
      : 'text-base tracking-[0.06em]'
  const dashedRectRatio = size === 'card' ? '4-5' : '1-1'

  return (
    <div
      className={`relative ${aspectClass} bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden ${className}`}
      role="img"
      aria-label={`Образец № ${sku} — фото готовится`}
    >
      <span
        className={`absolute top-3.5 left-3.5 font-lj-mono uppercase text-[var(--color-lj-ink)] opacity-55 ${eyebrowClass}`}
      >
        ОБРАЗЕЦ № {sku}
      </span>

      <div className="absolute inset-[18%] text-[var(--color-lj-ink)] opacity-30">
        <DashedRectMark ratio={dashedRectRatio} className="w-full h-full" />
      </div>

      <span
        className={`absolute bottom-3.5 left-1/2 -translate-x-1/2 font-lj-mono uppercase text-[var(--color-lj-ink)] opacity-70 whitespace-nowrap ${captionClass}`}
      >
        ФОТО ГОТОВИТСЯ
      </span>

      <div
        className="absolute bottom-12 left-[58%] w-[28%] text-[var(--color-lj-brand)] opacity-40"
        aria-hidden
      >
        <HandDrawnArrow className="w-full h-auto" />
      </div>
    </div>
  )
}
