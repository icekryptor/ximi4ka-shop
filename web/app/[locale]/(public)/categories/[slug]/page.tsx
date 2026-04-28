import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ApiError,
  getCategory,
  listCategories,
  listProductsByCategory,
} from '@/lib/api'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'
import { Container, Section, DisplayHeading, Ticker } from '@/components/ui'
import { Chip } from '@/components/ui/Chip'
import { Reveal } from '@/components/motion'
import { PreFooterCta } from '@/components/marketing'
import { GradientBlob } from '@/components/decor/GradientBlob'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const res = await listCategories({ limit: 100 })
    return SUPPORTED_LOCALES.flatMap((locale) =>
      res.data.map((cat) => ({ locale, slug: cat.slug })),
    )
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE
    ? `/categories/${slug}`
    : `/${locale}/categories/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  try {
    const category = await getCategory(slug)
    const name = pickField<string>(category, 'name', locale) ?? category.name
    const metaTitle = pickField<string>(category, 'metaTitle', locale)
    const metaDescription = pickField<string>(category, 'metaDescription', locale)
    const alternatesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc, slug)]),
    ) as Record<Locale, string>
    return buildMetadata({
      title: name,
      metaTitle,
      metaDescription,
      pathname: pathForLocale(locale, slug),
      type: 'website',
      locale,
      alternatesByLocale,
    })
  } catch {
    return { title: 'Категория — Ximi4ka' }
  }
}

async function fetchCategoryAndProducts(
  slug: string,
): Promise<{ category: ProductCategory; products: Product[] }> {
  let category: ProductCategory
  try {
    category = await getCategory(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }
  let products: Product[] = []
  try {
    const res = await listProductsByCategory(slug, { limit: 50 })
    products = res.data
  } catch {
    products = []
  }
  return { category, products }
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const { category, products } = await fetchCategoryAndProducts(slug)
  const name = pickField<string>(category, 'name', locale) ?? category.name
  const description =
    pickField<string>(category, 'metaDescription', locale) ??
    category.metaDescription ??
    null

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Каталог', url: '/categories' },
          { name, url: pathForLocale(locale, category.slug) },
        ])}
      />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      {/* Hero band */}
      <Section size="md" surface="soft" className="relative overflow-hidden">
        <GradientBlob className="pointer-events-none absolute -right-32 top-0 h-[140%] w-[40%] opacity-30" />
        <Container>
          <nav
            aria-label="breadcrumbs"
            className="relative z-10 mb-6 text-[length:var(--text-small)] text-[var(--color-text-muted)]"
          >
            <Link href="/" className="hover:text-[var(--color-brand-text)]">
              Главная
            </Link>
            <span className="mx-2" aria-hidden="true">·</span>
            <Link
              href="/categories"
              className="hover:text-[var(--color-brand-text)]"
            >
              Каталог
            </Link>
            <span className="mx-2" aria-hidden="true">·</span>
            <span className="text-[var(--color-brand-text)]">{name}</span>
          </nav>
          <div className="relative z-10 max-w-2xl">
            <Reveal>
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <DisplayHeading>{name}</DisplayHeading>
                {products.length > 0 && (
                  <Chip>{products.length} товаров</Chip>
                )}
              </div>
            </Reveal>
            {description && (
              <Reveal delay={0.05}>
                <p className="text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
                  {description}
                </p>
              </Reveal>
            )}
          </div>
        </Container>
      </Section>

      {/* Reassurance ticker */}
      {products.length > 0 && (
        <Ticker
          surface="soft"
          items={[
            'Сертифицировано',
            'Безопасно для образования',
            'Подробные инструкции',
            'Доставка по России',
          ]}
        />
      )}

      {/* Product grid */}
      <Section size="lg" surface="base">
        <Container>
          {products.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
                /* TODO(Task 4.4): replace with real catalog data + asymmetric grid */
                <ProductCard
                  key={product.id}
                  product={product}
                  stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                  statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)] mb-6">
                В этой категории пока нет товаров
              </p>
              <Link
                href="/categories"
                className="inline-flex items-center text-[var(--color-brand)] font-medium hover:text-[var(--color-brand-dark)]"
              >
                ← Все категории
              </Link>
            </div>
          )}
        </Container>
      </Section>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Изучите другие категории"
        cta={{ label: 'Все категории', href: '/categories' }}
      />
    </>
  )
}
