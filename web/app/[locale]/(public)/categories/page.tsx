import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listCategories } from '@/lib/api'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { Container, Section, DisplayHeading } from '@/components/ui'
import { Reveal } from '@/components/motion'
import { CategoryTile, PreFooterCta } from '@/components/marketing'
import { GradientBlob } from '@/components/decor/GradientBlob'
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

      {/* Hero band */}
      <Section size="md" surface="soft" className="relative overflow-hidden">
        <GradientBlob className="pointer-events-none absolute -right-32 top-0 h-[140%] w-[40%] opacity-30" />
        <Container>
          <div className="relative z-10 max-w-2xl">
            <Reveal>
              <DisplayHeading className="mb-4">Каталог</DisplayHeading>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
                Выберите направление эксперимента
              </p>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Tile grid */}
      <Section size="lg" surface="base">
        <Container>
          {categories.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category, i) => (
                <Reveal key={category.id} delay={(i % 3) * 0.05}>
                  <CategoryTile category={category} tintIndex={i} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)] mb-6">
                Каталог скоро появится
              </p>
              <Link
                href="/"
                className="inline-flex items-center text-[var(--color-brand)] font-medium hover:text-[var(--color-brand-dark)]"
              >
                ← На главную
              </Link>
            </div>
          )}
        </Container>
      </Section>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Не нашли что искали?"
        lead="Напишите нам — поможем подобрать набор под интересы и возраст."
        cta={{ label: 'Связаться с нами', href: '/kontakty' }}
      />
    </>
  )
}
