import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { pluralizeRu } from '@/lib/i18n'

type MoleculeVariant = 'benzene' | 'anthracene' | 'water' | 'methane'

// Semantic mapping per design doc §4. Falls back to benzene if slug not mapped.
const MOLECULE_BY_SLUG: Record<string, MoleculeVariant> = {
  'nabory-dlya-opytov': 'benzene',
  'reaktivy': 'water',
  'laboratornoe-oborudovanie': 'methane',
  'kombo': 'anthracene',
  'pechatnaya-produktsiya': 'water',
  'novinki': 'benzene',
}

interface Props {
  category: ProductCategory
  index: number
  productCount: number
}

export function CategoryTileLJ({ category, index, productCount }: Props) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const variant = MOLECULE_BY_SLUG[category.slug] ?? 'benzene'
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="callout-host group/cat relative block aspect-[5/4] bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 hover:border-[var(--color-lj-ink)]"
    >
      <span className="absolute top-3.5 left-3.5 z-[3] font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-55">
        arr. C-{pad(index + 1)}
      </span>
      <MoleculeMotifLJ
        variant={variant}
        className="absolute right-[-15%] top-[10%] w-[60%] text-[var(--color-lj-ink)] opacity-15 pointer-events-none"
      />
      <div className="absolute bottom-3.5 left-3.5 right-3.5 z-[2] flex flex-col gap-2">
        <h3 className="font-[var(--font-lj-display)] font-[700] text-[clamp(1.5rem,2.2vw,2rem)] leading-[0.95] tracking-[-0.035em] text-[var(--color-lj-ink)]">
          {category.name}
        </h3>
        <span className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-65">
          {productCount} {pluralizeRu(productCount, ['товар', 'товара', 'товаров'])} →
        </span>
      </div>
    </Link>
  )
}
