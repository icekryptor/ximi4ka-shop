import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getPage,
  getPublicSettings,
  listCategories,
  listPublishedProducts,
  type PublicSettings,
  type PublicTestimonial,
  type PublicTrustStripItem,
} from '@/lib/api'
import type { Block, Page, Product, ProductCategory } from '@ximi4ka-shop/shared'
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
  GlassCard,
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

const DEFAULT_TESTIMONIALS: PublicTestimonial[] = [
  {
    quote:
      'Сын в восторге от набора с кристаллами. Делаем эксперимент за экспериментом, я и сама втянулась.',
    author: 'Анна',
    location: 'Москва',
    rating: 5,
  },
  {
    quote:
      'Безопасно, понятно, интересно. Дочь (11 лет) делает эксперименты сама, я только подсказываю.',
    author: 'Михаил',
    location: 'Санкт-Петербург',
    rating: 5,
  },
  {
    quote:
      'Первый набор купили на день рождения, теперь покупаем регулярно. Дети уже спрашивают про химфак!',
    author: 'Елена',
    location: 'Казань',
    rating: 5,
  },
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

      {/* Category showcase */}
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
                  <CategoryTilePlaceholder category={category} tintIndex={i} />
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

      {/* How it works */}
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

      {/* Testimonials */}
      <Section size="lg" surface="base">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Отзывы" title="Что говорят родители" />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.slice(0, 3).map((testimonial, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <GlassCard className="h-full">
                  {testimonial.rating !== undefined && (
                    <div
                      className="mb-3 flex gap-0.5 text-[var(--color-brand)]"
                      aria-label={`Оценка ${testimonial.rating} из 5`}
                    >
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <span key={idx} aria-hidden="true">
                          {idx < testimonial.rating! ? '★' : '☆'}
                        </span>
                      ))}
                    </div>
                  )}
                  <blockquote className="mb-4 italic text-[length:var(--text-body)] text-[var(--color-brand-text)] leading-[var(--leading-body)]">
                    «{testimonial.quote}»
                  </blockquote>
                  <footer className="text-[length:var(--text-small)] font-medium text-[var(--color-brand-text-secondary)]">
                    {testimonial.author}, {testimonial.location}
                  </footer>
                </GlassCard>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* FAQ teaser */}
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

      {/* Other CMS-driven blocks (non-FAQ) */}
      {otherBlocks.length > 0 && (
        <Section size="md" surface="base">
          <Container>
            <div className="mx-auto max-w-3xl">
              <BlockRenderer blocks={otherBlocks} />
            </div>
          </Container>
        </Section>
      )}

      {/* Pre-footer CTA */}
      <Section size="lg" surface="gradient">
        <Container>
          <Reveal>
            <div className="flex flex-col items-center gap-6 text-center">
              <DisplayHeading
                as="h2"
                className="text-[var(--color-text-on-brand)]"
              >
                Готовы начать эксперимент?
              </DisplayHeading>
              <p className="max-w-2xl text-[length:var(--text-lead)] text-[var(--color-text-on-brand)] opacity-90">
                Начните с любого набора — все инструкции и материалы внутри.
              </p>
              <Button
                href="/categories"
                variant="secondary"
                size="lg"
                className="bg-white text-[var(--color-brand)] border-white hover:bg-white hover:opacity-95"
              >
                Открыть каталог
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}

function CategoryTilePlaceholder({
  category,
  tintIndex,
}: {
  category: ProductCategory
  tintIndex: number
}) {
  const tints = [
    'from-[rgba(141,103,255,0.15)] to-[rgba(141,103,255,0.05)]',
    'from-[rgba(200,86,255,0.15)] to-[rgba(200,86,255,0.05)]',
    'from-[rgba(170,100,255,0.15)] to-[rgba(170,100,255,0.05)]',
  ]
  const tint = tints[tintIndex % tints.length]
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`block rounded-[var(--radius-lg)] bg-gradient-to-br ${tint} p-8 min-h-[220px] transition hover:shadow-[var(--shadow-lg)]`}
    >
      <div className="flex flex-col gap-3">
        <h3 className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)]">
          {category.name}
        </h3>
        {category.metaDescription && (
          <p className="text-[length:var(--text-small)] text-[var(--color-brand-text-secondary)]">
            {category.metaDescription}
          </p>
        )}
      </div>
    </Link>
  )
}

function HowItWorksStep({
  number,
  title,
  body,
}: {
  number: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-[var(--font-display)] text-[length:var(--text-display)] text-[var(--color-brand)] leading-none">
        {number}
      </span>
      <h3 className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)]">
        {title}
      </h3>
      <p className="text-[length:var(--text-body)] text-[var(--color-brand-text-secondary)] leading-[var(--leading-body)]">
        {body}
      </p>
    </div>
  )
}
