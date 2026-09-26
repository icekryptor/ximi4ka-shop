import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductCard } from '@/components/ProductCard'
import { LabSection } from '@/components/ui/LabSection'
import { CatalogPromoBanner } from '@/components/catalog/CatalogPromoBanner'
import { CatalogGroupSection } from '@/components/catalog/CatalogGroupSection'
import { CompactProductRow } from '@/components/catalog/CompactProductRow'
import { PreFooterCta } from '@/components/marketing'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
import { fetchCatalog, densityForSlug, hasViewToggle } from '@/lib/catalogApi'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'

export const revalidate = 60

// generateStaticParams по локалям здесь не нужен: образ собирается без доступа
// к api (buildkit не пускает шаги сборки в docker-сеть), поэтому пререндер
// запёк бы в образ пустую страницу и отдавал её до конца окна revalidate.
// Без него страница рендерится по первому запросу — уже с данными — и дальше
// живёт в ISR-кеше те же 60 секунд.
interface Props {
  params: Promise<{ locale: string }>
}

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/catalog' : `/${locale}/catalog`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: 'Каталог — Ximi4ka',
    metaDescription:
      'Все наборы для химических опытов, реактивы и лабораторное оборудование Ximi4ka в одном каталоге.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function CatalogPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const { groups, totalProducts } = await fetchCatalog()

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const catalogPath = pathForLocale(locale)
  const categoryPath = (slug: string) =>
    locale === DEFAULT_LOCALE ? `/categories/${slug}` : `/${locale}/categories/${slug}`

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Каталог', url: '/catalog' },
        ])}
      />

      {/* Хлебные крошки */}
      <nav
        aria-label="breadcrumbs"
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.03em] opacity-70"
      >
        <Link href={homePath} className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100 text-[var(--color-lj-brand-deep)]">Каталог</span>
      </nav>

      {/* Витрина каталога (LAB CREAM) */}
      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          {/* В макете страница открывается сразу промо-баннером, видимого
              заголовка нет — h1 остаётся для поисковиков и скринридеров. */}
          <h1 className="sr-only">Каталог</h1>

          {/* Промо-баннер */}
          <div className="mb-16">
            <CatalogPromoBanner
              eyebrow="Доставка"
              headline="Бесплатная доставка СДЭК от 3000 ₽"
              sub="Собираем и отправляем в день заказа. До пункта выдачи — по всей России."
            />
          </div>

          {groups.length === 0 ? (
            <p className="text-center opacity-60 py-32 font-lj-mono uppercase tracking-[0.06em]">
              Каталог скоро появится
            </p>
          ) : (
            <div className="flex flex-col gap-24">
              {groups.map((group) => {
                const density = densityForSlug(group.category.slug)
                return (
                  <CatalogGroupSection
                    key={group.category.id}
                    headingId={`cat-${group.category.id}`}
                    title={group.category.name}
                    href={categoryPath(group.category.slug)}
                    layout={density}
                    list={
                      hasViewToggle(group.category.slug)
                        ? group.products.map((p) => (
                            <CompactProductRow key={p.id} product={p} images={p.images} />
                          ))
                        : undefined
                    }
                  >
                    {group.products.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                        statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                        images={p.images}
                        density={density}
                      />
                    ))}
                  </CatalogGroupSection>
                )
              })}
            </div>
          )}

          <p className="mt-16 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-55">
            Всего в каталоге: {totalProducts}
          </p>
        </div>
      </LabSection>

      <PreFooterCta
        title="Не нашли что искали?"
        lead="Напишите нам — поможем подобрать набор под интересы и возраст."
        cta={{ label: 'Связаться с нами', href: '/kontakty' }}
      />
    </>
  )
}
