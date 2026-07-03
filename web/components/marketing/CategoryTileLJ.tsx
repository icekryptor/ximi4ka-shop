import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
import { pluralizeRu } from '@/lib/i18n'

type MoleculeVariant = 'benzene' | 'anthracene' | 'water' | 'methane'

// Semantic mapping per design doc §4. Keys — реальные слаги категорий в БД
// (kits/combo/…); legacy-слаги оставлены на случай переименования. Falls back
// to benzene if slug not mapped.
const MOLECULE_BY_SLUG: Record<string, MoleculeVariant> = {
  kits: 'benzene',
  combo: 'anthracene',
  reagents: 'water',
  equipment: 'methane',
  print: 'water',
  // legacy slugs (pre-import naming)
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

// v3.5 Bright: плитка категории — яркий градиентный контейнер с крупным
// скруглением и белой типографикой (см. V3_5_BRIGHT_ADDENDUM §4).
export function CategoryTileLJ({ category, index, productCount }: Props) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const variant = MOLECULE_BY_SLUG[category.slug] ?? 'benzene'
  // «0 товаров» — сломанное состояние (public API пока не отдаёт счётчик);
  // показываем нейтральное «смотреть →» вместо нуля.
  const countLabel =
    productCount > 0
      ? `${productCount} ${pluralizeRu(productCount, ['товар', 'товара', 'товаров'])} →`
      : 'смотреть →'
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="callout-host group/cat lj-lift relative block aspect-[5/4] overflow-hidden rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-lj-brand-deep)]"
    >
      <span className="absolute top-5 left-6 z-[3] font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright-mute)]">
        arr. C-{pad(index + 1)}
      </span>
      <MoleculeMotifLJ
        variant={variant}
        className="absolute right-[-15%] top-[8%] w-[62%] text-[var(--color-lj-on-bright)] opacity-30 pointer-events-none transition-transform duration-700 group-hover/cat:rotate-6 group-hover/cat:scale-105"
      />
      <div className="absolute bottom-5 left-6 right-6 z-[2] flex flex-col gap-2">
        <h3 className="font-lj-display font-[700] text-[clamp(1.5rem,2.2vw,2rem)] leading-[0.95] tracking-[-0.035em] text-[var(--color-lj-on-bright)]">
          {category.name}
        </h3>
        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-on-bright-mute)]">
          {countLabel}
        </span>
      </div>
    </Link>
  )
}
