import Image from 'next/image'
import Link from 'next/link'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'
import { Callout } from '@/components/ui/Callout'
import { Chip } from '@/components/ui/Chip'
import { StatBar } from '@/components/ui/StatBar'
import { SpecimenCard } from './ui/SpecimenCard'

interface Stats {
  reagents: number
  instruments: number
  reactions: number
}

interface Props {
  product: Product
  emphasisWord?: string
  elementSymbol?: string
  badge?: string
  badgeVariant?: 'brand' | 'ink' | 'outline'
  stats: Stats
  statMaxes: Stats // per-stat-type max across all visible cards in a row
  chips?: string[]
  callout?: { text: string; position: 'right' | 'left'; topPercent?: number }
  images: ProductImage[]
  hoverFormula?: string
  cornerMark?: string
}

export function ProductCard({
  product,
  emphasisWord,
  elementSymbol,
  badge,
  badgeVariant = 'brand',
  stats,
  statMaxes,
  chips = [],
  callout,
  images,
  hoverFormula,
  cornerMark,
}: Props) {
  const sku = product.sku || product.slug
  const skuLabel = elementSymbol ? `№ ${sku} / ${elementSymbol}` : `№ ${sku}`
  const badgeClass =
    badgeVariant === 'brand'
      ? 'bg-[var(--color-lj-brand)] border-[var(--color-lj-brand)] text-[var(--color-lj-bone)]'
      : badgeVariant === 'ink'
        ? 'bg-[var(--color-lj-ink)] border-[var(--color-lj-ink)] text-[var(--color-lj-bone)]'
        : 'bg-transparent border-[var(--color-lj-ink)] text-[var(--color-lj-ink)]'

  const renderName = () => {
    if (!emphasisWord || !product.name.includes(emphasisWord)) return product.name
    const idx = product.name.indexOf(emphasisWord)
    return (
      <>
        {product.name.slice(0, idx)}
        <em className="italic text-[var(--color-lj-brand)] font-[700]">{emphasisWord}</em>
        {product.name.slice(idx + emphasisWord.length)}
      </>
    )
  }

  const formattedPrice = product.priceRub.toLocaleString('ru-RU').replace(/,/g, ' ')

  // Guard against divide-by-zero when caller passes 0 maxes.
  const pct = (value: number, max: number) =>
    max > 0 ? Math.round((value / max) * 100) : 0

  return (
    <article className="callout-host group/pcard relative cursor-pointer bg-transparent">
      <div className="flex justify-between items-center mb-3 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em]">
        <span className="text-[var(--color-lj-ink)] opacity-60">{skuLabel}</span>
        {badge && (
          <span className={`px-2.5 py-1 border rounded-full text-[0.625rem] tracking-[0.1em] ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>

      {images.length === 0 ? (
        <SpecimenCard sku={product.sku ?? product.slug} size="card" className="border-0" />
      ) : (
        <Link href={`/product/${product.slug}`} className="block">
          <div className="relative aspect-[4/5] bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 group-hover/pcard:border-[var(--color-lj-ink)]">
            {cornerMark && (
              <span className="absolute top-3.5 left-3.5 z-10 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-55">
                {cornerMark}
              </span>
            )}
            <Image
              src={images[0].url}
              alt={images[0].alt}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-[opacity,transform] duration-500 group-hover/pcard:scale-[1.04] group-hover/pcard:opacity-0"
            />
            {images[1] && (
              <Image
                src={images[1].url}
                alt={images[1].alt}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="absolute inset-0 object-cover opacity-0 transition-[opacity,transform] duration-500 group-hover/pcard:opacity-100 group-hover/pcard:scale-[1.04]"
              />
            )}
            {hoverFormula && (
              <div className="absolute bottom-3.5 left-3.5 z-10 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-lj-ink)] bg-[var(--color-lj-cream)] px-2.5 py-1.5 border border-[var(--color-lj-ink)] opacity-0 translate-y-2 transition-[opacity,transform] duration-500 group-hover/pcard:opacity-100 group-hover/pcard:translate-y-0">
                {hoverFormula}
              </div>
            )}
          </div>
        </Link>
      )}

      <div className="pt-5">
        <h3 className="font-[var(--font-lj-display)] font-[700] text-[clamp(1.5rem,2.1vw,2rem)] leading-[0.95] tracking-[-0.035em] mb-3.5">
          <Link href={`/product/${product.slug}`}>{renderName()}</Link>
        </h3>
        {product.shortDescription && (
          <p className="text-[0.9375rem] leading-[1.45] text-[var(--color-lj-ink)] opacity-72 mb-5 max-w-[32ch]">
            {product.shortDescription}
          </p>
        )}

        <ul className="list-none p-0 m-0 mb-5 flex flex-col gap-2 border-t border-[var(--color-lj-rule)] pt-4">
          <StatBar
            index="01"
            label="реактивов"
            value={stats.reagents}
            fillPercent={pct(stats.reagents, statMaxes.reagents)}
          />
          <StatBar
            index="02"
            label="инструментов"
            value={stats.instruments}
            fillPercent={pct(stats.instruments, statMaxes.instruments)}
          />
          <StatBar
            index="03"
            label="реакций"
            value={stats.reactions}
            fillPercent={pct(stats.reactions, statMaxes.reactions)}
          />
        </ul>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {chips.map((c, i) => (
              <Chip key={i}>{c}</Chip>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center border-t border-[var(--color-lj-rule)] pt-5 gap-4 flex-wrap">
          <span className="font-[var(--font-lj-display)] font-[900] text-3xl tracking-[-0.04em] leading-none">
            {formattedPrice}
            <span className="font-[var(--font-lj-mono)] font-normal text-base ml-1 opacity-70">₽</span>
          </span>
          <Link
            href={`/product/${product.slug}`}
            className="inline-flex items-center gap-2 px-4 py-3 border border-[var(--color-lj-ink)] rounded-full font-[var(--font-lj-mono)] text-[0.6875rem] uppercase tracking-[0.08em] bg-transparent text-[var(--color-lj-ink)] transition-all duration-400 group-hover/pcard:bg-[var(--color-lj-ink)] group-hover/pcard:text-[var(--color-lj-bone)]"
          >
            Заказать набор →
          </Link>
        </div>
      </div>

      {callout && <Callout text={callout.text} position={callout.position} topPercent={callout.topPercent} />}
    </article>
  )
}
