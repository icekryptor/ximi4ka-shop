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
import { LabSection } from '@/components/ui/LabSection'
import { Reveal, Stagger } from '@/components/motion'
import {
  Hero,
  CategoryTile,
  HowItWorksStep,
  TestimonialCard,
  PreFooterCta,
  Manifesto,
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

// v3 Lab Journal — hardcoded catalog of 3 flagship sets. The hero/manifesto/
// products copy is hardcoded in v3 (per design plan §9). Future CMS work can
// re-route this to a DB query; for now SITE_CATALOG ships the v3 design clean.
const SITE_CATALOG = [
  {
    sku: 'X-30',
    slug: 'himichka-3',
    name: 'Химичка 3.0',
    shortDescription:
      'Флагман: настоящая лаборатория у вас дома. От реакций меди до выращивания кристаллов.',
    priceRub: 3399,
    badge: 'Хит',
    badgeVariant: 'brand' as const,
    elementSymbol: 'Cu',
    emphasisWord: 'Химичка',
    cornerMark: 'arr. 01',
    hoverFormula: 'Cu + 2 AgNO₃ → Cu(NO₃)₂ + 2 Ag↓',
    chips: ['безопасно', 'ярко', 'от 10 лет'],
    stats: { reagents: 18, instruments: 12, reactions: 161 },
    callout: { text: '161 реакция', position: 'right' as const, topPercent: 28 },
    staggerOffset: 0,
  },
  {
    sku: 'X-MINI',
    slug: 'mini-himichka',
    name: 'Мини-Химичка',
    shortDescription:
      'Те же реакции, компактнее. Базовая посуда, идеален как первый набор или подарок.',
    priceRub: 1799,
    badge: 'Старт',
    badgeVariant: 'outline' as const,
    elementSymbol: 'NaCl',
    emphasisWord: 'Мини-',
    cornerMark: 'arr. 02',
    hoverFormula: 'Pocket lab · 18 реактивов',
    chips: ['подарок', 'от 8 лет'],
    stats: { reagents: 18, instruments: 4, reactions: 161 },
    callout: { text: 'от 1 799 ₽', position: 'left' as const, topPercent: 60 },
    staggerOffset: 4, // rem
  },
  {
    sku: 'X-EL',
    slug: 'electrohimichka',
    name: 'Электрохимичка',
    shortDescription:
      'Электролиз, гальваника, батарея. Полный комплект для опытов с током.',
    priceRub: 3299,
    badge: 'Pro',
    badgeVariant: 'ink' as const,
    elementSymbol: 'e⁻',
    emphasisWord: 'Электро',
    cornerMark: 'arr. 03',
    hoverFormula: '2 H₂O → 2 H₂↑ + O₂↑',
    chips: ['ток', 'гальваника', 'от 12 лет'],
    stats: { reagents: 14, instruments: 20, reactions: 74 },
    callout: { text: '20 инструментов', position: 'right' as const, topPercent: 18 },
    staggerOffset: 8, // rem
  },
]

// Per-stat-type max across the whole catalog row, so each card's bars tell a
// comparative story (e.g. Электрохимичка's instruments=20 fills 100%, while
// Химичка 3.0's instruments=12 fills ~60% of the same scale).
const SITE_CATALOG_STAT_MAXES = { reagents: 18, instruments: 20, reactions: 161 }

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

  // Hero copy is hard-coded in v3 (Lab Journal direction). The CMS-driven
  // eyebrow/title/lead path was retired with the v2 dark hero. If the editorial
  // story needs to vary again, reintroduce pickField() here and pass the values
  // through the v3 Hero's headlineRows/trailLine/lead props.

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

  const testimonials =
    settings?.testimonials && settings.testimonials.length > 0
      ? settings.testimonials
      : DEFAULT_TESTIMONIALS

  // Asymmetric span pattern across the 3-column grid produces a
  // varied, magazine-like rhythm rather than a strict grid.
  const categorySpans: Array<1 | 2> = [1, 2, 2, 1, 1, 2]

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      {/* 1. Hero (LAB CREAM) */}
      <Hero
        eyebrow="Опыты в коробке · Москва, с 2017"
        headlineRows={[
          { text: 'Опыт', emphasis: true },
          { text: 'вместо', offset: true },
          { text: 'объяснений' },
        ]}
        trailLine="— химия, которую держат в руках, а не учат наизусть."
        lead="3 набора. От реакций меди до электролиза — настоящие реагенты, посуда, понятные протоколы. То, что школа показывает на видео, вы делаете руками."
        primaryCta={{ label: 'Открыть каталог', href: '/catalog' }}
        secondaryCta={{ label: 'Что мы делаем', href: '#manifesto' }}
      />

      {/* 2. v3 Catalog — asymmetric 3-card row (LAB CREAM) */}
      <section className="bg-[var(--color-lj-cream)] px-6 py-32 relative">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <div className="flex justify-between items-end mb-24 gap-8 flex-wrap">
            <div>
              <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
                03.0 / Что собрать сегодня
              </p>
              <h2 className="font-[var(--font-lj-display)] font-[900] text-[clamp(2.5rem,5vw,4.75rem)] leading-[0.92] tracking-[-0.045em]">
                Готовые<br />
                <em className="italic text-[var(--color-lj-brand)] font-[900]">наборы</em>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1.1fr] gap-8">
            {SITE_CATALOG.map((p) => {
              const stagger =
                p.staggerOffset === 0
                  ? 'lg:mt-0'
                  : p.staggerOffset === 4
                    ? 'lg:mt-16'
                    : 'lg:mt-32'
              return (
                <div key={p.sku} className={stagger}>
                  <ProductCard
                    product={
                      {
                        id: p.slug,
                        slug: p.slug,
                        sku: p.sku,
                        name: p.name,
                        shortDescription: p.shortDescription,
                        priceRub: p.priceRub,
                        compareAtPriceRub: null,
                        stockStatus: 'in_stock',
                        isPublished: true,
                        longDescriptionBlocks: [],
                        images: [],
                      } as unknown as Product
                    }
                    emphasisWord={p.emphasisWord}
                    elementSymbol={p.elementSymbol}
                    badge={p.badge}
                    badgeVariant={p.badgeVariant}
                    cornerMark={p.cornerMark}
                    hoverFormula={p.hoverFormula}
                    chips={p.chips}
                    stats={p.stats}
                    statMaxes={SITE_CATALOG_STAT_MAXES}
                    callout={p.callout}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 3. Manifesto (DARK) */}
      <Manifesto
        eyebrow="02.0 / Принципы лаборатории"
        statementParts={[
          { text: 'Мы делаем ' },
          { text: 'химию', emphasis: true },
          { text: ', а не урок.' },
        ]}
        body="Каждый набор — запечатанный комплект реагентов, лабораторной посуды и понятных протоколов. Без воды, без слайдов, без «представьте, что произойдёт». Только реакция, наблюдение и вывод."
      />

      {/* 4. Каталог по интересам (LIGHT) — asymmetric tile masonry */}
      <Section size="lg" surface="base">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Каталог"
              title="Каталог по интересам"
              action={
                categories.length > 6
                  ? { label: 'Все категории', href: '/categories' }
                  : undefined
              }
            />
          </Reveal>
          {categories.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-3">
              {categories.slice(0, 6).map((category, i) => (
                <Reveal key={category.id} delay={(i % 3) * 0.05}>
                  <CategoryTile
                    category={category}
                    tintIndex={i}
                    span={categorySpans[i] ?? 1}
                  />
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

      {/* 5. Как это работает (DARK) */}
      <LabSection variant="ink" id="how-it-works" className="px-6 py-32">
        <Container>
          <Reveal>
            <div className="mb-12 flex flex-col items-center gap-3 text-center">
              <span className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                Просто
              </span>
              <h2 className="font-[var(--font-display)] text-[length:var(--text-h2)] tracking-[var(--tracking-tight)] leading-[1.05] text-[var(--color-text-on-dark)]">
                Как это работает
              </h2>
            </div>
          </Reveal>
          <Stagger className="grid gap-12 md:grid-cols-3">
            <HowItWorksStep
              theme="dark"
              number="01"
              title="Выберите набор"
              body="Подберите эксперимент по возрасту и интересам ребёнка. Все наборы безопасны и продуманы."
            />
            <HowItWorksStep
              theme="dark"
              number="02"
              title="Распакуйте и проведите эксперимент"
              body="Внутри — все необходимые реактивы и понятная инструкция. Можно проводить дома вместе с детьми."
            />
            <HowItWorksStep
              theme="dark"
              number="03"
              title="Получите полезные знания"
              body="Каждый набор сопровождается методическими материалами — научите детей думать как учёные."
            />
          </Stagger>
        </Container>
      </LabSection>

      {/* 6. Что говорят родители (LIGHT) */}
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

      {/* 7. Частые вопросы (LIGHT) */}
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

      {/* 8. Other CMS blocks (LIGHT) */}
      {otherBlocks.length > 0 && (
        <Section size="md" surface="base">
          <Container>
            <div className="mx-auto max-w-3xl">
              <BlockRenderer blocks={otherBlocks} />
            </div>
          </Container>
        </Section>
      )}

      {/* 9. Pre-footer (DARK) */}
      <PreFooterCta
        title="Готовы начать эксперимент?"
        lead="Начните с любого набора — все инструкции и материалы внутри."
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />
    </>
  )
}
