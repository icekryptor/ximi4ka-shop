import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductCard } from '@/components/ProductCard'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { CatalogPromoBanner } from '@/components/catalog/CatalogPromoBanner'
import { PreFooterCta } from '@/components/marketing'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
import { fetchCatalog, densityForSlug } from '@/lib/catalogApi'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

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
    locale === DEFAULT_LOCALE
      ? `/categories/${slug}`
      : `/${locale}/categories/${slug}`

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
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70"
      >
        <Link href={homePath} className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100 text-[var(--color-lj-brand-deep)]">
          Каталог
        </span>
      </nav>

      {/* Витрина каталога (LAB CREAM) */}
      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <NotebookHeader section="K" label="Каталог" page={1} total={1} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            K.0 / Все товары
          </p>
          <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.92] tracking-[-0.045em] mb-8">
            <em className="italic text-[var(--color-lj-brand)] font-[900]">
              Каталог
            </em>{' '}
            целиком
          </h1>

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
                  <section
                    key={group.category.id}
                    aria-labelledby={`cat-${group.category.id}`}
                  >
                    <div className="flex items-baseline justify-between gap-4 flex-wrap mb-8 border-b border-[var(--color-lj-rule)] pb-4">
                      <h2
                        id={`cat-${group.category.id}`}
                        className="font-lj-display font-[700] text-[clamp(1.75rem,3vw,2.75rem)] leading-[0.95] tracking-[-0.035em]"
                      >
                        {group.category.name}
                      </h2>
                      <Link
                        href={categoryPath(group.category.slug)}
                        className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-70 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)] transition-opacity"
                      >
                        Вся категория →
                      </Link>
                    </div>

                    {density === 'compact' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-5 gap-y-8">
                        {group.products.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                            statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                            images={p.images}
                            density="compact"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {group.products.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                            statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                            images={p.images}
                          />
                        ))}
                      </div>
                    )}
                  </section>
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
