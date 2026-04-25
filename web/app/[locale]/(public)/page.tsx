import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getPage,
  getPublicSettings,
  listPublishedProducts,
  type PublicSettings,
  type PublicTrustStripItem,
} from '@/lib/api'
import type { Page, Product } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { itemListJsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/jsonLd'
import {
  Container,
  Section,
  Eyebrow,
  DisplayHeading,
  SectionHeading,
  Button,
} from '@/components/ui'
import { Reveal, Fade, Stagger } from '@/components/motion'
import { MoleculeMotif, GradientBlob } from '@/components/decor'
import { HeroProductStack } from './_components/HeroProductStack'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

export const DEFAULT_TRUST_STRIP: PublicTrustStripItem[] = [
  { icon: '🚚', label: 'Доставка по России' },
  { icon: '🛡️', label: 'Безопасные реактивы' },
  { icon: '📚', label: 'Методические материалы' },
  { icon: '⭐', label: 'Более 1000 довольных семей' },
]

export function generateStaticParams() {
  // One root page per locale. Middleware rewrites unprefixed `/` to
  // `/${DEFAULT_LOCALE}` so RU is served at a clean URL.
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

interface Props {
  params: Promise<{ locale: string }>
}

interface FetchResult {
  page: Page | null
  products: Product[]
  settings: PublicSettings | null
}

async function fetchHome(): Promise<FetchResult> {
  const [pageRes, productsRes, settingsRes] = await Promise.allSettled([
    getPage('home'),
    listPublishedProducts({ limit: 8 }),
    getPublicSettings(),
  ])
  return {
    page: pageRes.status === 'fulfilled' ? pageRes.value : null,
    products:
      productsRes.status === 'fulfilled' && productsRes.value
        ? productsRes.value.data
        : [],
    settings: settingsRes.status === 'fulfilled' ? settingsRes.value : null,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale
  const home = await getPage('home').catch(() => null)
  const title =
    pickField<string>(home as unknown as Record<string, unknown>, 'title', locale) ??
    home?.title ??
    'Ximi4ka — наборы для химических экспериментов'
  const metaTitle = pickField<string>(
    home as unknown as Record<string, unknown>,
    'metaTitle',
    locale,
  )
  const metaDescription = pickField<string>(
    home as unknown as Record<string, unknown>,
    'metaDescription',
    locale,
  )
  return buildMetadata({
    title,
    description:
      'Химические наборы для детей и подростков. Научные эксперименты дома.',
    metaTitle,
    metaDescription,
    ogImage: home?.ogImage ?? null,
    canonicalUrl: home?.canonicalUrl ?? null,
    noindex: home?.noindex ?? false,
    pathname: locale === DEFAULT_LOCALE ? '/' : `/${locale}`,
    type: 'website',
    locale,
  })
}

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const { page, products, settings } = await fetchHome()

  const heroTitle =
    pickField<string>(page as unknown as Record<string, unknown>, 'title', locale) ??
    page?.title ??
    'Настоящая химия. Безопасно для детей.'

  const heroLead =
    pickField<string>(
      page as unknown as Record<string, unknown>,
      'metaDescription',
      locale,
    ) ??
    page?.metaDescription ??
    'Наборы для безопасных научных экспериментов с подробными методическими материалами для детей и подростков.'

  const blocks =
    (pickField<unknown[]>(
      page as unknown as Record<string, unknown>,
      'blocks',
      locale,
    ) ??
      page?.blocks ??
      []) as unknown[]

  const trustStripItems =
    settings?.trustStripItems && settings.trustStripItems.length > 0
      ? settings.trustStripItems
      : DEFAULT_TRUST_STRIP

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      {/* Hero */}
      <Section size="lg" surface="soft" className="relative overflow-hidden min-h-[70vh] md:min-h-[85vh] flex items-center">
        {/* Decorative gradient blob clipped to right edge */}
        <GradientBlob className="pointer-events-none absolute -right-40 top-0 h-[140%] w-[60%] opacity-50" />

        {/* Decorative molecule motif behind the right column */}
        <MoleculeMotif
          className="pointer-events-none absolute right-8 top-1/2 h-[320px] w-[320px] -translate-y-1/2 opacity-20 hidden md:block"
        />

        <Container>
          <div className="relative z-10 grid gap-12 md:grid-cols-5 md:gap-16">
            {/* Left column — copy + CTAs (3/5 columns) */}
            <div className="md:col-span-3 flex flex-col justify-center">
              <Fade>
                <Eyebrow className="mb-4">Химия дома</Eyebrow>
              </Fade>
              <Fade delay={0.05}>
                <DisplayHeading className="mb-6">{heroTitle}</DisplayHeading>
              </Fade>
              <Fade delay={0.1}>
                <p className="mb-8 max-w-prose text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
                  {heroLead}
                </p>
              </Fade>
              <Fade delay={0.15}>
                <div className="flex flex-wrap gap-4">
                  <Button href="/categories" size="lg">
                    Смотреть наборы
                  </Button>
                  <Button href="#how-it-works" variant="secondary" size="lg">
                    Как это работает
                  </Button>
                </div>
              </Fade>
            </div>

            {/* Right column — product cutout collage (2/5 columns) */}
            <div className="md:col-span-2 relative min-h-[400px] md:min-h-[500px]">
              <HeroProductStack products={products.slice(0, 3)} />
            </div>
          </div>
        </Container>
      </Section>

      {/* Trust strip */}
      <Section size="sm" surface="soft">
        <Container>
          <Reveal>
            <Stagger className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[length:var(--text-small)] font-medium text-[var(--color-brand-text-secondary)]">
              {trustStripItems.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </span>
              ))}
            </Stagger>
          </Reveal>
        </Container>
      </Section>

      {/* Featured products */}
      <Section size="lg">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Каталог"
              title="Бестселлеры"
              action={{ label: 'Смотреть всё', href: '/categories' }}
            />
          </Reveal>
          {products.length > 0 ? (
            <Reveal>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.slice(0, 8).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </Reveal>
          ) : (
            <p className="text-center text-[var(--color-brand-text-secondary)]">
              Контент загружается...
            </p>
          )}
        </Container>
      </Section>

      {/* Optional CMS-driven blocks render after the curated sections */}
      {blocks.length > 0 && (
        <Section size="md">
          <Container>
            <BlockRenderer blocks={blocks} />
          </Container>
        </Section>
      )}

      {/* TODO(task-2.3): category showcase, how-it-works, testimonials, FAQ teaser, pre-footer CTA */}
    </>
  )
}
