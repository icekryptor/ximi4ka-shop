import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listCategories } from '@/lib/api'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { CategoryTileLJ } from '@/components/marketing/CategoryTileLJ'
import { PreFooterCta } from '@/components/marketing'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
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
  return locale === DEFAULT_LOCALE ? '/categories' : `/${locale}/categories`
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
    metaDescription: 'Все наборы для химических экспериментов от Ximi4ka.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

async function fetchCategories(): Promise<ProductCategory[]> {
  try {
    const res = await listCategories({ limit: 100 })
    return res.data
  } catch {
    return []
  }
}

export default async function CategoriesListPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const categories = await fetchCategories()

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Каталог', url: '/categories' },
        ])}
      />

      {/* X. Каталог (LAB CREAM) — v3 LJ hero + drawer-card grid */}
      <LabSection variant="cream" className="px-6 pt-32 pb-24">
        <NotebookHeader section="X" label="Каталог" page={1} total={1} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            X.0 / Все категории
          </p>
          <h1 className="font-[var(--font-lj-display)] font-[900] text-[clamp(3rem,7vw,6rem)] leading-[0.92] tracking-[-0.045em] mb-8">
            Категории
          </h1>
          <p className="text-xl leading-[1.45] opacity-78 max-w-[48ch] mb-16">
            Выберите тематику набора. От базовых наборов до электрохимии.
          </p>
          {categories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {categories.map((cat, i) => (
                <CategoryTileLJ
                  key={cat.id}
                  category={cat}
                  index={i}
                  // TODO(productCount): public /api/public/categories does not
                  // currently return productCount. Show 0 until the API is
                  // plumbed through (Task 8.A.4 finding).
                  productCount={(cat as { productCount?: number }).productCount ?? 0}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-[var(--color-lj-ink)] opacity-65">
              Каталог скоро появится
            </p>
          )}
        </div>
      </LabSection>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Не нашли что искали?"
        lead="Напишите нам — поможем подобрать набор под интересы и возраст."
        cta={{ label: 'Связаться с нами', href: '/kontakty' }}
      />
    </>
  )
}
