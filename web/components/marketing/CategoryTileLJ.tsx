import Image from 'next/image'
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
  reaktivy: 'water',
  'laboratornoe-oborudovanie': 'methane',
  kombo: 'anthracene',
  'pechatnaya-produktsiya': 'water',
  novinki: 'benzene',
}

// Фото-карточки категорий (web/public/img/categories). Кадры построены под эту
// плитку: слева пустое фиолетовое поле под текст, товар — справа, поэтому
// кадр прижат вправо (object-right), а при обрезке 3:2 → 5:4 теряется левый
// край фона, а не продукт. Ключи — те же слаги, что и в MOLECULE_BY_SLUG;
// категория без картинки остаётся на градиенте с молекулой.
const IMAGE_BY_SLUG: Record<string, string> = {
  kits: '/img/categories/kits.webp',
  combo: '/img/categories/combo.webp',
  reagents: '/img/categories/reagents.webp',
  equipment: '/img/categories/equipment.webp',
  print: '/img/categories/print.webp',
  // legacy slugs (pre-import naming)
  'nabory-dlya-opytov': '/img/categories/kits.webp',
  kombo: '/img/categories/combo.webp',
  reaktivy: '/img/categories/reagents.webp',
  'laboratornoe-oborudovanie': '/img/categories/equipment.webp',
  'pechatnaya-produktsiya': '/img/categories/print.webp',
}

interface Props {
  category: ProductCategory
  productCount: number
}

// v3.5 Bright: плитка категории — яркий градиентный контейнер с крупным
// скруглением и белой типографикой (см. V3_5_BRIGHT_ADDENDUM §4).
export function CategoryTileLJ({ category, productCount }: Props) {
  const variant = MOLECULE_BY_SLUG[category.slug] ?? 'benzene'
  const image = IMAGE_BY_SLUG[category.slug]
  // «0 товаров» — сломанное состояние (public API пока не отдаёт счётчик);
  // показываем нейтральное «смотреть →» вместо нуля.
  const countLabel =
    productCount > 0
      ? `${productCount} ${pluralizeRu(productCount, ['товар', 'товара', 'товаров'])} →`
      : 'смотреть →'
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group/cat lj-lift relative block aspect-[5/4] overflow-hidden rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-lj-brand-deep)]"
    >
      {image ? (
        <>
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-right transition-transform duration-700 group-hover/cat:scale-105"
          />
          {/* Затемнение снизу-слева: заголовок иногда ложится на край товара. */}
          <span
            aria-hidden
            className="absolute inset-0 z-[1] bg-gradient-to-tr from-black/45 via-black/10 to-transparent pointer-events-none"
          />
        </>
      ) : (
        <MoleculeMotifLJ
          variant={variant}
          className="absolute right-[-15%] top-[8%] w-[62%] text-[var(--color-lj-on-bright)] opacity-30 pointer-events-none transition-transform duration-700 group-hover/cat:rotate-6 group-hover/cat:scale-105"
        />
      )}
      <div className="absolute bottom-5 left-6 right-6 z-[2] flex flex-col gap-2">
        <h3 className="font-lj-mazzard font-medium text-2xl leading-none text-[var(--color-lj-on-bright)] md:font-light md:text-[clamp(1.5rem,2.2vw,2rem)] md:leading-[0.95]">
          {category.name}
        </h3>
        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.03em] text-[var(--color-lj-on-bright-mute)]">
          {countLabel}
        </span>
      </div>
    </Link>
  )
}
