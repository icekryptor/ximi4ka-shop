import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getPublishedProduct, listPublishedProducts } from '@/lib/api'
import type { Product } from '@ximi4ka-shop/shared'

// v3 Preview E — Direction E: final synthesis.
//
// Combines:
//   * Preview D's Lab-Tech hero (dark + graph paper + acid purple +
//     mono meta + cinematic product anchor + numbered indicators)
//   * Original Mazzard H Extrabold + IBM Plex Sans + IBM Plex Mono
//     typography (NOT Syne / Manrope / JetBrains)
//   * White product card backgrounds (Russian marketplace style) with
//     sticker badges (ХИТ, −N%, From-X лет)
//   * Dark / light zebra-stripe section rhythm
//   * Russian marketplace density throughout the catalog section
//
// This is the FINAL preview before locking v3. Hero + manifesto + CTA
// stay dark; catalog + how-it-works flip to light. The zebra is the
// structural device for "remove scrolling fatigue."

export const dynamic = 'force-dynamic'

const TOKENS = `
  .v3e {
    /* === Dark palette === */
    --bg-dark-0: #0a0a12;
    --bg-dark-1: #0f0f18;
    --bg-dark-2: #16161e;
    --line-dark: #1f1f2a;
    --line-dark-bright: #2a2a38;
    --text-dark-0: #f4f3f7;
    --text-dark-1: #c8c5d0;
    --text-dark-2: #7a7a8a;
    --text-dark-3: #4b4b57;

    /* === Light palette === */
    --bg-light-0: #faf9fb;
    --bg-light-1: #ffffff;
    --line-light: #e8e5ef;
    --line-light-bright: #d0c8e0;
    --text-light-0: #1c1528;
    --text-light-1: #524667;
    --text-light-2: rgba(82, 70, 103, 0.6);

    /* === Accents === */
    --acid: #a78bfa;
    --acid-dim: #7c5cea;
    --warn: #ff5b3f;
    --blue: #5cb6ff;

    color: var(--text-dark-0);
    font-family: var(--font-plex), 'IBM Plex Sans', system-ui, sans-serif;
  }

  .v3e .display {
    font-family: var(--font-display), 'Mazzard H', 'IBM Plex Sans', system-ui, sans-serif;
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  .v3e .mono {
    font-family: var(--font-plex-mono), 'IBM Plex Mono', 'Courier New', monospace;
  }

  /* === Dark section === */
  .v3e .dark-section {
    position: relative;
    background: var(--bg-dark-0);
    color: var(--text-dark-0);
  }
  .v3e .dark-section::before {
    content: '';
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      radial-gradient(circle at 12% 8%, rgba(167,139,250,0.08), transparent 35%),
      radial-gradient(circle at 88% 92%, rgba(92,182,255,0.05), transparent 40%);
    z-index: 0;
  }
  .v3e .grid-bg {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      linear-gradient(rgba(167,139,250,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(167,139,250,0.025) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  }
  .v3e .noise {
    position: absolute; inset: 0; pointer-events: none; z-index: 1;
    opacity: 0.04; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .v3e .dark-section > * { position: relative; z-index: 2; }

  /* === Light section === */
  .v3e .light-section {
    position: relative;
    background: var(--bg-light-0);
    color: var(--text-light-0);
  }
  .v3e .light-section .display { color: var(--text-light-0); }

  /* === Effects === */
  .v3e .strike {
    position: relative; display: inline-block; color: var(--text-dark-2);
  }
  .v3e .strike::after {
    content: ''; position: absolute; left: -2%; right: -2%; top: 52%;
    height: 5px; background: var(--warn); transform: rotate(-2deg);
  }
  .v3e .acid-text {
    color: var(--acid); font-weight: 800;
  }
  .v3e .light-section .acid-text {
    color: var(--acid-dim);
  }
  .v3e .pulse-dot {
    width: 10px; height: 10px; background: var(--acid); border-radius: 50%;
    box-shadow: 0 0 12px var(--acid);
    animation: v3e-pulse 2s ease-in-out infinite;
  }
  .v3e .stock-dot {
    width: 6px; height: 6px; background: #34d399; border-radius: 50%;
    box-shadow: 0 0 8px #34d399;
    animation: v3e-pulse-stock 2.4s ease-in-out infinite;
  }
  @keyframes v3e-pulse {
    0%, 100% { box-shadow: 0 0 8px var(--acid); transform: scale(1); }
    50% { box-shadow: 0 0 18px var(--acid); transform: scale(1.15); }
  }
  @keyframes v3e-pulse-stock {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .v3e .ticker-track {
    display: inline-flex; gap: 48px;
    animation: v3e-ticker 60s linear infinite;
    white-space: nowrap; width: max-content;
  }
  .v3e .ticker-track:hover { animation-play-state: paused; }
  @keyframes v3e-ticker {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  /* === Hero product anchor === */
  .v3e .product-anchor {
    position: relative;
    border-radius: 32px;
    overflow: hidden;
  }
  .v3e .product-anchor::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at 50% 50%, rgba(167,139,250,0.35) 0%, transparent 70%);
  }
  .v3e .product-anchor::after {
    content: ''; position: absolute; left: 8%; right: 8%; bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--acid) 50%, transparent 100%);
    pointer-events: none;
  }

  /* === Russian marketplace product card (LIGHT, white bg) === */
  .v3e .market-card {
    background: var(--bg-light-1);
    border: 1px solid var(--line-light);
    border-radius: 24px;
    transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
    position: relative;
  }
  .v3e .market-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 20px 40px -10px rgba(167,139,250,0.18);
    border-color: var(--line-light-bright);
  }
  .v3e .market-card-image-area {
    position: relative;
    background: radial-gradient(circle at 30% 30%, rgba(141,103,255,0.08) 0%, rgba(200,86,255,0.04) 50%, var(--bg-light-1) 100%);
    border-radius: 16px;
  }
  .v3e .sticker {
    display: inline-flex; align-items: center;
    border-radius: 999px;
    padding: 4px 10px;
    font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .v3e .sticker-acid { background: var(--acid); color: #ffffff; }
  .v3e .sticker-warn { background: var(--warn); color: #ffffff; }
  .v3e .sticker-dark { background: var(--bg-dark-0); color: var(--text-dark-0); }
  .v3e .sticker-soft { background: rgba(167,139,250,0.12); color: var(--acid-dim); }

  /* === Reduced motion === */
  @media (prefers-reduced-motion: reduce) {
    .v3e .pulse-dot,
    .v3e .stock-dot,
    .v3e .ticker-track { animation: none; }
    .v3e .market-card:hover { transform: none; box-shadow: none; }
  }
`

async function fetchData() {
  try {
    const [product, list] = await Promise.all([
      getPublishedProduct('himichka-30').catch(() => null),
      listPublishedProducts({ limit: 8 }).catch(() => null),
    ])
    return { product, products: list?.data ?? [] }
  } catch {
    return { product: null, products: [] as Product[] }
  }
}

const ruble = (n: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)

export default async function V3PreviewE() {
  const { product, products } = await fetchData()
  const catalogProducts = products.slice(0, 4)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      <main className="v3e relative min-h-screen overflow-x-hidden bg-[var(--bg-dark-0)]">
        {/* === Top preview ribbon === */}
        <div className="dark-section z-50 border-b border-[var(--line-dark)] bg-black/40 px-8 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] mono uppercase tracking-[0.2em] text-[var(--text-dark-2)]">
            <span>Ximi4ka v3 · preview E (final synthesis)</span>
            <span className="space-x-3">
              <Link
                href="/v3-preview"
                className="text-[var(--text-dark-3)] hover:text-[var(--acid)] transition"
              >
                A
              </Link>
              <Link
                href="/v3-preview-b"
                className="text-[var(--text-dark-3)] hover:text-[var(--acid)] transition"
              >
                B
              </Link>
              <Link
                href="/v3-preview-c"
                className="text-[var(--text-dark-3)] hover:text-[var(--acid)] transition"
              >
                C
              </Link>
              <Link
                href="/v3-preview-d"
                className="text-[var(--text-dark-3)] hover:text-[var(--acid)] transition"
              >
                D
              </Link>
              <Link
                href="/"
                className="text-[var(--text-dark-3)] hover:text-[var(--acid)] transition"
              >
                v2
              </Link>
            </span>
          </div>
        </div>

        {/* === Sticky nav === */}
        <header className="dark-section sticky top-0 z-40 border-b border-[var(--line-dark)] bg-[rgba(10,10,18,0.7)] backdrop-blur-xl">
          <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-6">
            <div className="flex items-center gap-2.5">
              <span className="pulse-dot" />
              <span className="display text-[18px] tracking-[-0.04em] text-[var(--text-dark-0)]">
                Ximi4ka
              </span>
            </div>
            <Link
              href="/categories"
              className="mono inline-flex items-center gap-2 rounded-full bg-[var(--acid)] px-5 py-2.5 text-[13px] font-medium text-[var(--bg-dark-0)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(167,139,250,0.25)]"
            >
              Открыть каталог
            </Link>
          </nav>
        </header>

        {/* ═══ DARK 1: HERO ═══ */}
        <section className="dark-section relative overflow-hidden">
          <div className="grid-bg" />
          <div className="noise" />
          <div className="mx-auto max-w-[1280px] px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
            {/* Mono meta tags */}
            <div className="mb-12 flex flex-wrap gap-4 mono text-[12px] text-[var(--text-dark-2)] uppercase tracking-[0.08em]">
              <MetaTag>{product?.sku ?? 'KIT-001'}</MetaTag>
              <MetaTag>Химия дома</MetaTag>
              <MetaTag>С 2017 года</MetaTag>
              <MetaTag>48 наборов в каталоге</MetaTag>
            </div>

            <div className="grid gap-12 lg:grid-cols-5 lg:items-center lg:gap-16">
              {/* Text column 2/5 */}
              <div className="lg:col-span-2">
                <h1 className="display mb-8 text-[clamp(36px,5.5vw,76px)]">
                  Настоящая <span className="strike">химия в учебнике</span>{' '}
                  <span className="acid-text" style={{ fontStyle: 'italic' }}>
                    — не одна.
                  </span>
                  <br />
                  Химия — у&nbsp;тебя дома.
                </h1>
                <p className="mb-10 max-w-xl text-[clamp(15px,1.4vw,18px)] text-[var(--text-dark-1)] leading-[1.6]">
                  Безопасные наборы для научных экспериментов с реактивами,
                  посудой и подробной методичкой. Проверено химиками.
                  Сертифицировано.
                </p>
                <div className="mb-8 flex flex-wrap items-center gap-5">
                  <Link
                    href="/categories"
                    className="group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[var(--acid)] px-7 py-[16px] text-[15px] font-bold text-[var(--bg-dark-0)] tracking-[-0.01em] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(167,139,250,0.3)]"
                  >
                    Открыть каталог
                    <ArrowRight
                      className="h-4 w-4 transition group-hover:translate-x-1"
                      strokeWidth={2.5}
                    />
                  </Link>
                </div>
                <p className="mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-dark-2)]">
                  <span className="text-[var(--acid)]">15 000+</span> семей ·{' '}
                  <span className="text-[var(--acid)]">161</span> опыт ·{' '}
                  <span className="text-[var(--acid)]">48</span> наборов
                </p>
              </div>

              {/* Product anchor 3/5 */}
              <div className="lg:col-span-3">
                <div className="relative">
                  <div className="absolute -top-1 left-2 z-20 mono text-[11px] uppercase tracking-[0.12em] text-[var(--acid)]">
                    01 / 04
                  </div>
                  <div className="absolute -top-1 right-2 z-20 flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-dark-2)]">
                    <span className="stock-dot" />
                    В наличии
                  </div>
                  <div className="product-anchor mt-8 flex aspect-[4/3] items-center justify-center bg-[rgba(167,139,250,0.04)] p-8 lg:p-12">
                    {product?.images?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.images[0].url}
                        alt={product.images[0].alt || product.name}
                        className="relative z-10 max-h-full max-w-full object-contain"
                        style={{
                          filter:
                            'drop-shadow(0 30px 60px rgba(167,139,250,0.45))',
                        }}
                      />
                    ) : (
                      <div className="display text-3xl text-[var(--text-dark-3)]">
                        Product
                      </div>
                    )}
                  </div>
                  {/* Spec strip */}
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3 mono text-[11px] uppercase tracking-[0.12em]">
                    <SpecPill>{product?.sku ?? '7V25'}</SpecPill>
                    <SepDot />
                    <SpecPill>161 опытов</SpecPill>
                    <SepDot />
                    <SpecPill>От 10 лет</SpecPill>
                    <SepDot />
                    <SpecPill>17 реактивов</SpecPill>
                  </div>
                  {/* Name + price */}
                  {product && (
                    <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <p className="display text-[clamp(24px,2.5vw,32px)] text-[var(--text-dark-0)]">
                          {product.name}
                        </p>
                        <p className="mono text-[12px] mt-1 uppercase tracking-[0.08em] text-[var(--text-dark-3)]">
                          FLAGSHIP · BEST SELLER
                        </p>
                      </div>
                      <p className="display text-[clamp(28px,3vw,40px)] text-[var(--acid)]">
                        {ruble(product.priceRub)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ DARK 2: FORMULA TICKER ═══ */}
        <div className="dark-section border-t border-b border-[var(--line-dark)] bg-[var(--bg-dark-1)] overflow-hidden py-[18px] whitespace-nowrap">
          <div className="ticker-track mono text-[14px] text-[var(--text-dark-2)]">
            <FormulaTickerRow />
            <FormulaTickerRow />
          </div>
        </div>

        {/* ═══ LIGHT 3: КАТАЛОГ (Russian marketplace, white cards) ═══ */}
        <section className="light-section relative overflow-hidden">
          <div className="mx-auto max-w-[1280px] px-8 py-24 lg:py-32">
            <SectionTag light>02 · Каталог</SectionTag>
            <h2 className="display mb-14 max-w-4xl text-[clamp(36px,5vw,64px)] text-[var(--text-light-0)] tracking-[-0.035em]">
              48 <span className="acid-text">наборов</span> и реактивов{' '}
              <em className="display not-italic text-[var(--text-light-2)]">
                для всех уровней.
              </em>
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {catalogProducts.map((p, i) => (
                <MarketCard
                  key={p.id}
                  product={p}
                  index={i}
                  total={catalogProducts.length}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ DARK 4: MANIFESTO ═══ */}
        <section className="dark-section relative overflow-hidden">
          <div className="grid-bg" />
          <div className="mx-auto max-w-[1280px] px-8 py-24 lg:py-32">
            <SectionTag>03 · О нас</SectionTag>
            <h2 className="display mb-12 max-w-4xl text-[clamp(36px,5vw,64px)] tracking-[-0.035em]">
              Что такое <span className="acid-text">Химичка.</span>
            </h2>
            <p className="mb-16 max-w-2xl text-[18px] text-[var(--text-dark-1)] leading-[1.6]">
              Безопасно. Образовательно. Сертифицировано. Создаём наборы для
              химических экспериментов с 2017 года.
            </p>
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
              <BigStat value="9" label="лет на рынке" />
              <BigStat value="15 000+" label="счастливых семей" />
              <BigStat value="48" label="наборов и реактивов" />
              <BigStat value="161" label="опыт в одном наборе" />
            </div>
          </div>
        </section>

        {/* ═══ LIGHT 5: КАК ЭТО РАБОТАЕТ ═══ */}
        <section className="light-section relative overflow-hidden">
          <div className="mx-auto max-w-[1280px] px-8 py-24 lg:py-32">
            <SectionTag light>04 · Просто</SectionTag>
            <h2 className="display mb-16 max-w-4xl text-[clamp(36px,5vw,64px)] text-[var(--text-light-0)] tracking-[-0.035em]">
              Как это работает.
            </h2>
            <div className="grid gap-12 lg:grid-cols-3">
              <Step
                number="01"
                title="Выберите набор"
                body="Подберите эксперимент по возрасту и интересам ребёнка. Все наборы безопасны и продуманы."
              />
              <Step
                number="02"
                title="Распакуйте и проведите эксперимент"
                body="Внутри — все необходимые реактивы и понятная инструкция. Можно проводить дома вместе с детьми."
              />
              <Step
                number="03"
                title="Получите полезные знания"
                body="Каждый набор сопровождается методическими материалами — научите детей думать как учёные."
              />
            </div>
          </div>
        </section>

        {/* ═══ DARK 6: PRE-FOOTER CTA ═══ */}
        <section className="dark-section relative overflow-hidden">
          <div className="grid-bg" />
          <div className="mx-auto max-w-[1280px] px-8 py-24 text-center lg:py-32">
            <h2 className="display mb-8 mx-auto max-w-3xl text-[clamp(36px,6vw,72px)]">
              Готовы начать <span className="acid-text">эксперимент?</span>
            </h2>
            <p className="mb-10 mx-auto max-w-2xl text-[18px] text-[var(--text-dark-1)]">
              Начните с любого набора — все инструкции и материалы внутри.
            </p>
            <Link
              href="/categories"
              className="group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[var(--acid)] px-9 py-[18px] text-[16px] font-bold text-[var(--bg-dark-0)] tracking-[-0.01em] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(167,139,250,0.3)]"
            >
              Открыть каталог
              <ArrowRight
                className="h-4 w-4 transition group-hover:translate-x-1"
                strokeWidth={2.5}
              />
            </Link>
            <p className="mt-6 mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-dark-2)]">
              Доставка по России от 3 дней
            </p>
          </div>
        </section>

        <div className="dark-section relative">
          <div className="mx-auto max-w-[1280px] px-8 py-12">
            <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-dark-3)]">
              Preview E · Final synthesis · This page is not part of the
              production site
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

// ===== Helpers =====

function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--acid)] before:content-['']">
      {children}
    </span>
  )
}

function SpecPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md text-[var(--text-dark-1)]">
      {children}
    </span>
  )
}

function SepDot() {
  return <span className="text-[var(--text-dark-3)]">·</span>
}

function SectionTag({
  children,
  light = false,
}: {
  children: React.ReactNode
  light?: boolean
}) {
  return (
    <div
      className={`mb-6 flex items-center gap-3 mono text-[12px] uppercase tracking-[0.1em] ${
        light ? 'text-[var(--acid-dim)]' : 'text-[var(--acid)]'
      }`}
    >
      <span
        className={`block h-px w-8 ${
          light ? 'bg-[var(--acid-dim)]' : 'bg-[var(--acid)]'
        }`}
      />
      {children}
    </div>
  )
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="display text-[clamp(56px,8vw,96px)] leading-[0.85] text-[var(--acid)]">
        {value}
      </span>
      <span className="block h-[3px] w-12 rounded-full bg-[var(--acid)]" />
      <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--text-dark-2)]">
        {label}
      </span>
    </div>
  )
}

function Step({
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
      <span className="display text-[clamp(56px,7vw,80px)] leading-[0.85] text-[var(--acid-dim)]">
        {number}
      </span>
      <h3 className="display text-[clamp(20px,2vw,28px)] text-[var(--text-light-0)]">
        {title}
      </h3>
      <p className="text-[15px] text-[var(--text-light-1)] leading-[1.6]">
        {body}
      </p>
    </div>
  )
}

// === MARKET CARD (Russian marketplace style — white card with stickers) ===
function MarketCard({
  product,
  index,
  total,
}: {
  product: Product
  index: number
  total: number
}) {
  const isFirst = index === 0
  const hasDiscount =
    product.compareAtPriceRub != null && product.compareAtPriceRub > product.priceRub
  const discount = hasDiscount
    ? Math.round((1 - product.priceRub / product.compareAtPriceRub!) * 100)
    : null

  return (
    <Link
      href={`/product/${product.slug}`}
      className="market-card group flex flex-col gap-4 p-4 cursor-pointer no-underline"
    >
      {/* Image area + stickers */}
      <div className="market-card-image-area relative aspect-square overflow-hidden p-4">
        {/* Sticker badges */}
        {isFirst && (
          <span className="sticker sticker-acid absolute top-3 left-3 z-10">
            ХИТ
          </span>
        )}
        {discount && (
          <span className="sticker sticker-warn absolute top-3 right-3 z-10">
            −{discount}%
          </span>
        )}
        <span className="sticker sticker-dark absolute bottom-3 left-3 z-10">
          {String(index + 1).padStart(2, '0')} /{' '}
          {String(total).padStart(2, '0')}
        </span>

        {product.images?.[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.images[0].url}
            alt={product.images[0].alt || product.name}
            className="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center display text-2xl text-[var(--text-light-2)]">
            {product.name}
          </div>
        )}
      </div>

      {/* SKU + name */}
      <div className="px-2">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-light-2)] mb-1">
          {product.sku ?? 'SKU'}
        </p>
        <h3 className="display text-[clamp(15px,1.3vw,18px)] tracking-[-0.02em] text-[var(--text-light-0)] line-clamp-2 leading-[1.15]">
          {product.name}
        </h3>
      </div>

      {/* Price */}
      <div className="px-2 mt-auto flex items-baseline gap-2">
        <span className="display text-[clamp(20px,2vw,26px)] text-[var(--text-light-0)] tracking-[-0.025em]">
          {ruble(product.priceRub)}
        </span>
        {hasDiscount && (
          <span className="mono text-[12px] line-through text-[var(--text-light-2)]">
            {ruble(product.compareAtPriceRub!)}
          </span>
        )}
      </div>
    </Link>
  )
}

function FormulaTickerRow() {
  return (
    <>
      <span className="text-[var(--text-dark-1)]">CuSO₄ + Fe → FeSO₄ + Cu</span>
      <span>·</span>
      <span className="text-[var(--acid)]">2H₂O → 2H₂ + O₂</span>
      <span>·</span>
      <span className="text-[var(--text-dark-1)]">NaOH + HCl → NaCl + H₂O</span>
      <span>·</span>
      <span className="text-[var(--acid)]">15 000+ семей с 2017</span>
      <span>·</span>
      <span className="text-[var(--text-dark-1)]">161 опыт в наборе</span>
      <span>·</span>
      <span className="text-[var(--acid)]">17 реактивов · 6 пробирок</span>
      <span>·</span>
      <span className="text-[var(--text-dark-1)]">2H₂O₂ → 2H₂O + O₂</span>
      <span>·</span>
      <span className="text-[var(--acid)]">CaCO₃ → CaO + CO₂</span>
      <span>·</span>
    </>
  )
}
