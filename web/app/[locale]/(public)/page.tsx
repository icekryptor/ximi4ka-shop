import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getPage,
  getPublishedProduct,
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
import { LabSection } from '@/components/ui/LabSection'
import { Ticker } from '@/components/ui'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { Hero, PreFooterCta, Manifesto, DEFAULT_TESTIMONIALS } from '@/components/marketing'
import { CategoryTileLJ } from '@/components/marketing/CategoryTileLJ'
import { HowItWorksStepLJ } from '@/components/marketing/HowItWorksStepLJ'
import { TestimonialQuoteLJ } from '@/components/marketing/TestimonialQuoteLJ'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, pickField, type Locale } from '@/lib/i18n'

export const revalidate = 60

// v3 Lab Journal — hardcoded catalog of 3 flagship sets. Marketing decoration
// (callouts, stats, hover formulas, chips, badges) lives here; each `slug`
// resolves to a real DB product at request time so the cards render real
// product photos. The drift unit test (page.test.tsx) catches any slug here
// that doesn't exist in the DB. `export` is required for that test;
// `as const` preserves literal types so `badgeVariant`/`callout.position`
// stay narrow without redundant casts.
// NOTE: `name`, `shortDescription`, and `priceRub` here are FALLBACK-ONLY
// values used by the synthetic Product literal when a slug doesn't resolve
// in the DB (drift / outage). In normal operation the DB-resolved product's
// fields win — editing these strings will NOT change what renders on the
// homepage. To change the displayed name/price/blurb, edit the DB product.
export const SITE_CATALOG = [
  {
    sku: 'X-30',
    slug: 'himichka-30',
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
    slug: 'elektrohimichka',
    name: 'Электрохимичка',
    shortDescription: 'Электролиз, гальваника, батарея. Полный комплект для опытов с током.',
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
] as const

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
  const [pageRes, productsRes, settingsRes, categoriesRes] = await Promise.allSettled([
    getPage('home'),
    listPublishedProducts({ limit: 8 }),
    getPublicSettings(),
    listCategories({ limit: 100 }),
  ])
  return {
    page: pageRes.status === 'fulfilled' ? pageRes.value : null,
    products: productsRes.status === 'fulfilled' && productsRes.value ? productsRes.value.data : [],
    settings: settingsRes.status === 'fulfilled' ? settingsRes.value : null,
    categories:
      categoriesRes.status === 'fulfilled' && categoriesRes.value ? categoriesRes.value.data : [],
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
    description: 'Химические наборы для детей и подростков. Научные эксперименты дома.',
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

// v3.5: факты для яркого маркиз-тикера между hero и каталогом.
const FACTS_TICKER = [
  '161 опыт',
  '62 реактива',
  'доставка СДЭК',
  'от 8 лет',
  '4,9 из 5 на WB и Ozon',
  '20 000+ покупателей',
]

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const { page, products, settings, categories } = await fetchHome()

  // Hero copy is hard-coded in v3 (Lab Journal direction). The CMS-driven
  // eyebrow/title/lead path was retired with the v2 dark hero. If the editorial
  // story needs to vary again, reintroduce pickField() here and pass the values
  // through the v3 Hero's headlineRows/trailLine/lead props.

  const blocks = (pickField<unknown[]>(
    page as unknown as Record<string, unknown>,
    'blocks',
    locale,
  ) ??
    page?.blocks ??
    []) as unknown[]

  const allBlocks = blocks as Block[]
  const faqBlocks = allBlocks.filter((b) => b && (b as Block).type === 'faq')
  const otherBlocks = allBlocks.filter((b) => b && (b as Block).type !== 'faq')

  const testimonials =
    settings?.testimonials && settings.testimonials.length > 0
      ? settings.testimonials
      : DEFAULT_TESTIMONIALS

  // First six categories featured on the homepage; full list lives at /categories.
  const featuredCategories = categories.slice(0, 6)

  // Hybrid resolution: SITE_CATALOG keeps the marketing decoration (callouts,
  // stats, chips, hover formulas) in code, but each flagship slug resolves to
  // a DB product at request time so the cards render real product photos. If
  // a slug doesn't resolve (drift), we log + render the SpecimenCard fallback
  // via empty images[]. The unit test (page.test.tsx) catches drift at CI
  // time so prod shouldn't see this branch — but we degrade gracefully if it
  // does. (locale-aware fetch will land when the public products endpoint
  // gains per-locale resolution; for now getPublishedProduct ignores it.)
  const flagships = await Promise.all(
    SITE_CATALOG.map(async (entry) => {
      const dbProduct = await getPublishedProduct(entry.slug).catch(() => null)
      if (!dbProduct) {
        console.warn(`[SITE_CATALOG] Slug not found in DB: ${entry.slug}`)
      }
      return { ...entry, dbProduct }
    }),
  )

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
        trailLine="Химия, которую держат в руках."
        lead="3 набора: от реакций меди до электролиза. Внутри реагенты, лабораторная посуда и протоколы к каждому опыту. Ребёнок проводит их своими руками — то, что в учебнике осталось картинкой на видео."
        primaryCta={{ label: 'Открыть каталог', href: '/catalog' }}
        secondaryCta={{ label: 'Что мы делаем', href: '#manifesto' }}
        slides={flagships
          // Слайдер флагманов (v3.5). Берём все флагманы с DB-фото; каждый
          // слайд — реальный продукт с ценой из БД, ссылкой и CTA «В корзину».
          // Без фото слайд не показываем; при <1 валидном слайде Hero скрывает
          // панель и разворачивает заголовок на всю ширину.
          .filter((f) => f.dbProduct && f.dbProduct.images.length > 0)
          .map((f, i) => {
            const p = f.dbProduct!
            return {
              productId: p.id,
              slug: p.slug,
              name: p.name,
              priceRub: p.priceRub,
              imageUrl: p.images[0].url,
              alt: p.name,
              href: `/product/${p.slug}`,
              label: `fig. 00${i + 1} — ${f.emphasisWord ?? 'флагман'}`,
            }
          })}
      />

      {/* 1.5 Маркиз-тикер фактов (v3.5 BRIGHT) */}
      <Ticker items={FACTS_TICKER} surface="bright" />

      {/* 2. v3 Catalog — asymmetric 3-card row (LAB CREAM) */}
      <section className="bg-[var(--color-lj-cream)] px-6 py-32 relative">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <div className="flex justify-between items-end mb-24 gap-8 flex-wrap">
            <div>
              <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
                03.0 / Что собрать сегодня
              </p>
              <h2 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4.75rem)] leading-[0.92] tracking-[-0.045em]">
                Готовые
                <br />
                <em className="italic text-[var(--color-lj-brand)] font-[900]">наборы</em>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1.1fr] gap-8">
            {flagships.map((entry) => {
              const stagger =
                entry.staggerOffset === 0
                  ? 'lg:mt-0'
                  : entry.staggerOffset === 4
                    ? 'lg:mt-16'
                    : 'lg:mt-32'
              // Synthetic Product fallback when slug doesn't resolve in DB.
              // Should be unreachable in prod (drift test catches misses at
              // CI), but we degrade gracefully here so the page still renders.
              const product: Product = entry.dbProduct ?? {
                id: `synthetic-${entry.slug}`,
                slug: entry.slug,
                sku: entry.sku,
                name: entry.name,
                shortDescription: entry.shortDescription,
                longDescriptionBlocks: [],
                priceRub: entry.priceRub,
                compareAtPriceRub: null,
                stockStatus: 'in_stock',
                isPublished: true,
                sortOrder: 0,
                metaTitle: null,
                metaDescription: null,
                ogImage: null,
                canonicalUrl: null,
                noindex: false,
                translations: {},
                images: [],
                createdAt: '',
                updatedAt: '',
              }
              return (
                <div key={entry.slug} className={stagger}>
                  <ProductCard
                    product={product}
                    emphasisWord={entry.emphasisWord}
                    elementSymbol={entry.elementSymbol}
                    badge={entry.badge}
                    badgeVariant={entry.badgeVariant}
                    cornerMark={entry.cornerMark}
                    hoverFormula={entry.hoverFormula}
                    chips={[...entry.chips]}
                    stats={entry.stats}
                    statMaxes={SITE_CATALOG_STAT_MAXES}
                    callout={entry.callout}
                    images={entry.dbProduct?.images ?? []}
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
          { text: 'В коробке — настоящая ' },
          { text: 'химия', emphasis: true },
          { text: '.' },
        ]}
        body="Каждый набор — запечатанный комплект: реагенты, лабораторная посуда, протокол к каждому опыту. Никаких «представьте, что произойдёт» — ребёнок смешивает, смотрит на реакцию и записывает вывод."
      />

      {/* 4. Каталог по интересам (LAB CREAM) — v3 LJ tiles with molecule motifs */}
      <LabSection variant="cream" className="px-6 py-32">
        <NotebookHeader section="04" label="Каталог" page={4} total={9} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            04.0 / Каталог
          </p>
          <h2 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.045em] mb-16">
            Каталог по
            <br />
            <em className="italic text-[var(--color-lj-brand)] font-[900]">интересам</em>
          </h2>
          {featuredCategories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuredCategories.map((cat, i) => (
                <CategoryTileLJ
                  key={cat.id}
                  category={cat}
                  index={i}
                  // TODO(productCount): public /api/public/categories does not
                  // currently return productCount. Stage 8.C.2 (categories
                  // rewrite) will plumb the count through; for now show 0.
                  productCount={(cat as { productCount?: number }).productCount ?? 0}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-[var(--color-lj-ink)] opacity-65">
              Категории появятся скоро
            </p>
          )}
        </div>
      </LabSection>

      {/* 5. Как это работает (DARK INK) — v3 LJ NumberCell steps */}
      <LabSection variant="ink" id="how-it-works" className="px-6 py-32 relative">
        <NotebookHeader section="05" label="Процесс" page={5} total={9} />
        <div className="max-w-[var(--max-lj-narrow)] mx-auto relative z-[2]">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)] mb-12 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            05.0 / Процесс
          </p>
          <h2 className="font-lj-display font-[700] text-[clamp(2rem,4vw,3.5rem)] leading-[1.0] tracking-[-0.04em] mb-16 max-w-[20ch]">
            От заказа до <em className="italic text-[var(--color-lj-brand)] font-[700]">опыта</em> —
            три шага
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <HowItWorksStepLJ
              index={1}
              verb="ВЫБРАТЬ"
              title="Выберите набор"
              body="Подберите набор по возрасту и интересам ребёнка. Для каждого указано, с какого возраста и что понадобится дома."
            />
            <HowItWorksStepLJ
              index={2}
              verb="СОБРАТЬ"
              title="Распакуйте и проведите"
              body="Внутри — все необходимые реактивы и понятная инструкция. Можно проводить дома вместе с детьми."
            />
            <HowItWorksStepLJ
              index={3}
              verb="ВЕСТИ"
              title="Получите знания"
              body="Каждый набор сопровождается методическими материалами — научите детей думать как учёные."
            />
          </div>
        </div>
      </LabSection>

      {/* 6. Что говорят родители (LAB CREAM) — v3 LJ lab-citation quotes */}
      <LabSection variant="cream" className="px-6 py-32">
        <NotebookHeader section="06" label="Отзывы" page={6} total={9} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            06.0 / Отзывы
          </p>
          <h2 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.045em] mb-16">
            Что говорят
            <br />
            <em className="italic text-[var(--color-lj-brand)] font-[900]">родители</em>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {testimonials.slice(0, 3).map((t, i) => {
              // PublicTestimonial has shape { quote, author, location, rating? }.
              // Map to TestimonialQuoteLJ's { body, author, meta[] } —
              // location goes into the citation meta line.
              const meta = [t.location].filter(Boolean) as string[]
              return (
                <TestimonialQuoteLJ
                  key={`${t.author}-${i}`}
                  body={t.quote}
                  author={t.author.toUpperCase()}
                  meta={meta}
                />
              )
            })}
          </div>
        </div>
      </LabSection>

      {/* 7. Частые вопросы (LAB CREAM) — v3 LabSection wrapper */}
      {faqBlocks.length > 0 && (
        <LabSection variant="cream" className="px-6 py-32" id="faq">
          <NotebookHeader section="07" label="FAQ" page={7} total={9} />
          <div className="max-w-[var(--max-lj-narrow)] mx-auto">
            <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
              07.0 / Вопросы
            </p>
            <h2 className="font-lj-display font-[700] text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.035em] mb-12 max-w-[20ch]">
              Частые <em className="italic text-[var(--color-lj-brand)] font-[700]">вопросы</em>
            </h2>
            <BlockRenderer blocks={faqBlocks} />
          </div>
        </LabSection>
      )}

      {/* 8. Other CMS blocks (LAB CREAM) — v3 LabSection wrapper */}
      {otherBlocks.length > 0 && (
        <LabSection variant="cream" className="px-6 py-24">
          <NotebookHeader section="08" label="Дополнительно" page={8} total={9} />
          <div className="max-w-[var(--max-lj-narrow)] mx-auto">
            <BlockRenderer blocks={otherBlocks} />
          </div>
        </LabSection>
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
