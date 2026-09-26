import Image from 'next/image'
import Link from 'next/link'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'
import { Chip } from '@/components/ui/Chip'
import { StatBar } from '@/components/ui/StatBar'
import { SpecimenCard } from './ui/SpecimenCard'
import { CompactProductCard } from './catalog/CompactProductCard'

interface Stats {
  reagents: number
  instruments: number
  reactions: number
}

interface Props {
  product: Product
  emphasisWord?: string
  stats: Stats
  statMaxes: Stats // per-stat-type max across all visible cards in a row
  chips?: string[]
  // Decoupled from product.images so the homepage hybrid (Task 11.5) can pair
  // a synthetic Product literal with DB-resolved images. Callers that have a
  // real DB Product can simply pass `images={product.images}`.
  images: ProductImage[]
  hoverFormula?: string
  // v3.5: увеличенная карточка (первая в категорийной сетке) — широкая
  // фото-плита вместо портретной.
  featured?: boolean
  // Плотность карточки. 'kit' (по умолчанию) — крупная фото-форвард карточка
  // набора с описанием/статами. 'compact' — плотная карточка реактива
  // /оборудования (мелкое фото, степпер + «В корзину»), делегируется в
  // CompactProductCard. Дефолт сохраняет существующее поведение — вызовы на
  // главной по типам не ломаются.
  density?: 'kit' | 'compact'
}

export function ProductCard({
  product,
  emphasisWord,
  stats,
  statMaxes,
  chips = [],
  images,
  hoverFormula,
  featured = false,
  density = 'kit',
}: Props) {
  // Компактная плотность — отдельная клиентская карточка со степпером.
  // Возврат до вычислений «kit»-разметки: у compact своя структура.
  if (density === 'compact') {
    return <CompactProductCard product={product} images={images} />
  }

  // Категорийные карточки пока не имеют реальных стат (TODO Task 4.4) —
  // нулевые бары выглядят сломанными, скрываем блок целиком.
  const hasStats = stats.reagents > 0 || stats.instruments > 0 || stats.reactions > 0

  const renderName = () => {
    if (!emphasisWord || !product.name.includes(emphasisWord)) return product.name
    const idx = product.name.indexOf(emphasisWord)
    return (
      <>
        {product.name.slice(0, idx)}
        <em className="italic text-[var(--color-lj-brand)]">{emphasisWord}</em>
        {product.name.slice(idx + emphasisWord.length)}
      </>
    )
  }

  const formattedPrice = product.priceRub.toLocaleString('ru-RU').replace(/,/g, ' ')

  // Guard against divide-by-zero when caller passes 0 maxes.
  const pct = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0)

  // Раскладка по макету Figma «Карточки», Density=Kit: квадратное фото,
  // название, под ним цена с «Заказать набор →», затем описание, статы, чипсы.
  // Вертикальные отступы и кегль названия — Desktop с md, ниже — Mobile.
  return (
    <article className="group/pcard lj-lift relative cursor-pointer bg-transparent">
      {images.length === 0 ? (
        <SpecimenCard sku={product.sku ?? product.slug} size="card" className="border-0" />
      ) : (
        <Link href={`/product/${product.slug}`} className="block">
          <div
            className={`relative ${featured ? 'aspect-[16/10]' : 'aspect-square'} bg-white rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color,box-shadow] duration-500 group-hover/pcard:border-[var(--color-lj-brand)] group-hover/pcard:shadow-[var(--shadow-lj-bright)]`}
          >
            <Image
              src={images[0].url}
              alt={images[0].alt}
              fill
              sizes={featured ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'}
              className="object-cover transition-[opacity,transform] duration-500 group-hover/pcard:scale-[1.04] group-hover/pcard:opacity-0"
            />
            {images[1] && (
              <Image
                src={images[1].url}
                alt={images[1].alt}
                fill
                sizes={
                  featured ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'
                }
                className="absolute inset-0 object-cover opacity-0 transition-[opacity,transform] duration-500 group-hover/pcard:opacity-100 group-hover/pcard:scale-[1.04]"
              />
            )}
            {hoverFormula && (
              <div className="absolute bottom-3.5 left-3.5 z-10 font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-lj-ink)] bg-[var(--color-lj-cream)] px-2.5 py-1.5 border border-[var(--color-lj-ink)] opacity-0 translate-y-2 transition-[opacity,transform] duration-500 group-hover/pcard:opacity-100 group-hover/pcard:translate-y-0">
                {hoverFormula}
              </div>
            )}
          </div>
        </Link>
      )}

      <div className="pt-5 flex flex-col gap-5">
        <div className="flex flex-col gap-5 md:gap-2.5">
          <h3 className="font-lj-mazzard font-light text-[1.875rem] leading-[1.2] tracking-[-0.035em] md:text-[2.25rem] md:leading-[1.1] md:tracking-[-0.03em]">
            <Link href={`/product/${product.slug}`}>{renderName()}</Link>
          </h3>
          <div className="flex flex-wrap justify-between items-center gap-4 border-t border-[var(--color-lj-rule)] pt-5">
            <span className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="font-lj-mazzard font-light text-4xl leading-none">
                {formattedPrice}
              </span>
              <span className="font-lj-mono text-base opacity-70">₽</span>
            </span>
            <Link href={`/product/${product.slug}`} className="lj-btn lj-btn-primary px-3 py-2.5">
              Заказать набор →
            </Link>
          </div>
        </div>

        {product.shortDescription && (
          <p className="text-[0.9375rem] leading-[1.45] text-[var(--color-lj-ink)] opacity-72">
            {product.shortDescription}
          </p>
        )}

        {hasStats && (
          <ul className="list-none p-0 m-0 flex flex-col gap-2 border-t border-[var(--color-lj-rule)] pt-4 md:pt-5">
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
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {chips.map((c, i) => (
              <Chip key={i}>{c}</Chip>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
