import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getPage,
  getPublicSettings,
  listCategories,
  listPublishedProducts,
  type PublicSettings,
} from '@/lib/api'
import type { Block, Page, Product, ProductCategory } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { itemListJsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/jsonLd'
import { Container, Section, SectionHeading } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import {
  Hero,
  TrustStrip,
  CategoryTile,
  HowItWorksStep,
  TestimonialCard,
  PreFooterCta,
  DEFAULT_TRUST_STRIP,
  DEFAULT_TESTIMONIALS,
} from '@/components/marketing'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

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
  categories: ProductCategory[]
}

async function fetchHome(): Promise<FetchResult> {
  const [pageRes, productsRes, settingsRes, categoriesRes] =
    await Promise.allSettled([
      getPage('home'),
      listPublishedProducts({ limit: 8 }),
      getPublicSettings(),
      listCategories({ limit: 100 }),
    ])
  return {
    page: pageRes.status === 'fulfilled' ? pageRes.value : null,
    products:
      productsRes.status === 'fulfilled' && productsRes.value
        ? productsRes.value.data
        : [],
    settings: settingsRes.status === 'fulfilled' ? settingsRes.value : null,
    categories:
      categoriesRes.status === 'fulfilled' && categoriesRes.value
        ? categoriesRes.value.data
        : [],
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
  const { page, products, settings, categories } = await fetchHome()

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

  const allBlocks = blocks as Block[]
  const faqBlocks = allBlocks.filter((b) => b && (b as Block).type === 'faq')
  const otherBlocks = allBlocks.filter(
    (b) => b && (b as Block).type !== 'faq',
  )

  const trustStripItems =
    settings?.trustStripItems && settings.trustStripItems.length > 0
      ? settings.trustStripItems
      : DEFAULT_TRUST_STRIP

  const testimonials =
    settings?.testimonials && settings.testimonials.length > 0
      ? settings.testimonials
      : DEFAULT_TESTIMONIALS

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      <Hero
        eyebrow="Химия дома"
        title={heroTitle}
        lead={heroLead}
        primaryCta={{ label: 'Смотреть наборы', href: '/categories' }}
        secondaryCta={{ label: 'Как это работает', href: '#how-it-works' }}
        products={products.slice(0, 3)}
      />

      <Section size="sm" surface="soft">
        <Container>
          <Reveal>
            <TrustStrip items={trustStripItems} />
          </Reveal>
        </Container>
      </Section>

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

      <Section size="lg" surface="base">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Каталог"
              title="Каталог по интересам"
              action={
                categories.length > 3
                  ? { label: 'Все категории', href: '/categories' }
                  : undefined
              }
            />
          </Reveal>
          {categories.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-3">
              {categories.slice(0, 3).map((category, i) => (
                <Reveal key={category.id} delay={i * 0.05}>
                  <CategoryTile category={category} tintIndex={i} />
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="text-center text-[var(--color-brand-text-secondary)]">
              Категории появятся скоро
            </p>
          )}
        </Container>
      </Section>

      <Section size="lg" surface="soft" id="how-it-works">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Просто" title="Как это работает" />
          </Reveal>
          <Stagger className="grid gap-8 md:grid-cols-3">
            <HowItWorksStep
              number="01"
              title="Выберите набор"
              body="Подберите эксперимент по возрасту и интересам ребёнка. Все наборы безопасны и продуманы."
            />
            <HowItWorksStep
              number="02"
              title="Распакуйте и проведите эксперимент"
              body="Внутри — все необходимые реактивы и понятная инструкция. Можно проводить дома вместе с детьми."
            />
            <HowItWorksStep
              number="03"
              title="Получите полезные знания"
              body="Каждый набор сопровождается методическими материалами — научите детей думать как учёные."
            />
          </Stagger>
        </Container>
      </Section>

      <Section size="lg" surface="base">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Отзывы" title="Что говорят родители" />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.slice(0, 3).map((testimonial, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <TestimonialCard testimonial={testimonial} />
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {faqBlocks.length > 0 && (
        <Section size="lg" surface="soft">
          <Container>
            <Reveal>
              <SectionHeading
                eyebrow="Вопросы"
                title="Частые вопросы"
                action={{ label: 'Все ответы', href: '/o-nas' }}
              />
            </Reveal>
            <div className="mx-auto max-w-3xl">
              <BlockRenderer blocks={faqBlocks} />
            </div>
          </Container>
        </Section>
      )}

      {otherBlocks.length > 0 && (
        <Section size="md" surface="base">
          <Container>
            <div className="mx-auto max-w-3xl">
              <BlockRenderer blocks={otherBlocks} />
            </div>
          </Container>
        </Section>
      )}

      <PreFooterCta
        title="Готовы начать эксперимент?"
        lead="Начните с любого набора — все инструкции и материалы внутри."
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />
    </>
  )
}
