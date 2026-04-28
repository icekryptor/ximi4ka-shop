import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getPublishedProduct, listPublishedProducts } from '@/lib/api'
import type { Product } from '@ximi4ka-shop/shared'

// v3 Preview D — Direction D: Lab-Tech (C's vocabulary) + cinematic
// product-led hero (iyO/drinksom hybrid).
//
// Same dark canvas, graph-paper grid, Syne/Manrope/JetBrains Mono stack,
// acid-violet accent, formula ticker and pulse-dot logo as Direction C.
// The new move is the hero: a two-column 2/5–3/5 layout where the
// Химичка 3.0 photo sits on a radial acid-purple halo with a glow-line
// underneath, flanked by mono "01 / 04" and "В наличии" indicators and a
// glass spec-strip with mono pills. The catalog section adopts the
// drinksom-style numbered rhythm («01 / 04» on each card).
//
// PREVIEW-ONLY: tokens are inlined in a <style> tag scoped to `.v3d` so
// nothing leaks into v2 production. This route is excluded from middleware
// (locale rewrites, redirects) and the layout is chromeless.

export const dynamic = 'force-dynamic'

const TOKENS = `
  .v3d {
    --bg-0: #0a0a12;
    --bg-1: #0f0f18;
    --bg-2: #16161e;
    --line: #1f1f2a;
    --line-bright: #2a2a38;
    --text-0: #f4f3f7;
    --text-1: #c8c5d0;
    --text-2: #7a7a8a;
    --text-3: #4b4b57;
    --acid: #a78bfa;
    --acid-dim: #7c5cea;
    --warn: #ff5b3f;
    --blue: #5cb6ff;
    background: var(--bg-0);
    color: var(--text-0);
    font-family: var(--font-manrope), 'Manrope', sans-serif;
    background-image:
      radial-gradient(circle at 12% 8%, rgba(167,139,250,0.08), transparent 35%),
      radial-gradient(circle at 88% 92%, rgba(92,182,255,0.05), transparent 40%);
    -webkit-font-smoothing: antialiased;
  }
  /* Syne lacks Cyrillic on Google Fonts. Per-glyph fallback chain: Latin
     in Syne, Cyrillic falls through to Manrope ExtraBold. */
  .v3d .display {
    font-family: var(--font-syne), var(--font-manrope), 'Syne', 'Manrope', sans-serif;
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  .v3d .mono {
    font-family: var(--font-jetbrains), 'JetBrains Mono', monospace;
  }
  .v3d .grid-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      linear-gradient(rgba(167,139,250,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(167,139,250,0.025) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  }
  .v3d .noise {
    position: fixed; inset: 0; pointer-events: none; z-index: 1;
    opacity: 0.04; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .v3d .strike { position: relative; display: inline-block; color: var(--text-2); }
  .v3d .strike::after {
    content: ''; position: absolute; left: -2%; right: -2%; top: 52%;
    height: 5px; background: var(--warn); transform: rotate(-2deg);
  }
  .v3d .acid-text { color: var(--acid); font-style: italic; font-weight: 800; }
  .v3d .pulse-dot {
    width: 10px; height: 10px; background: var(--acid); border-radius: 50%;
    box-shadow: 0 0 12px var(--acid); animation: v3d-pulse 2s ease-in-out infinite;
  }
  .v3d .stock-dot {
    width: 6px; height: 6px; background: #34d399; border-radius: 50%;
    box-shadow: 0 0 8px #34d399; animation: v3d-pulse-stock 2.4s ease-in-out infinite;
  }
  @keyframes v3d-pulse {
    0%, 100% { box-shadow: 0 0 8px var(--acid); transform: scale(1); }
    50% { box-shadow: 0 0 18px var(--acid); transform: scale(1.15); }
  }
  @keyframes v3d-pulse-stock {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .v3d .ticker-track {
    display: inline-flex; gap: 48px;
    animation: v3d-ticker 60s linear infinite;
    white-space: nowrap;
    width: max-content;
  }
  .v3d .ticker-track:hover { animation-play-state: paused; }
  @keyframes v3d-ticker {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  /* Hero product container — radial halo + glow line underneath. */
  .v3d .product-anchor {
    position: relative;
    border-radius: 32px;
    overflow: hidden;
  }
  .v3d .product-anchor::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 50%, rgba(167,139,250,0.35) 0%, transparent 70%);
    pointer-events: none;
  }
  .v3d .product-anchor::after {
    content: '';
    position: absolute; left: 8%; right: 8%; bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--acid) 50%, transparent 100%);
    pointer-events: none;
  }
  /* Carousel card — same product treatment, smaller scale. */
  .v3d .carousel-card {
    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s, border-color 0.4s;
  }
  .v3d .carousel-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -10px rgba(167,139,250,0.25);
  }
  @media (prefers-reduced-motion: reduce) {
    .v3d .pulse-dot,
    .v3d .stock-dot,
    .v3d .ticker-track { animation: none; }
    .v3d .carousel-card:hover { transform: none; box-shadow: none; }
  }
`

async function fetchData() {
  try {
    const [product, list] = await Promise.all([
      getPublishedProduct('himichka-30').catch(() => null),
      listPublishedProducts({ limit: 4 }).catch(() => null),
    ])
    return { product, products: list?.data ?? [] }
  } catch {
    return { product: null as Product | null, products: [] as Product[] }
  }
}

const ruble = (n: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)

export default async function V3PreviewD() {
  const { product, products } = await fetchData()
  const carouselProducts = products.slice(0, 4)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      <main className="v3d relative min-h-screen overflow-x-hidden">
        <div className="grid-bg" />
        <div className="noise" />

        {/* === Top preview ribbon === */}
        <div className="relative z-50 border-b border-[var(--line)] bg-black/30 px-8 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] mono uppercase tracking-[0.2em] text-[var(--text-2)]">
            <span>Ximi4ka v3 · preview D</span>
            <span className="space-x-4">
              <Link href="/v3-preview" className="text-[var(--text-3)] transition hover:text-[var(--acid)]">A</Link>
              <Link href="/v3-preview-b" className="text-[var(--text-3)] transition hover:text-[var(--acid)]">B</Link>
              <Link href="/v3-preview-c" className="text-[var(--text-3)] transition hover:text-[var(--acid)]">C</Link>
              <Link href="/" className="text-[var(--text-3)] transition hover:text-[var(--acid)]">v2</Link>
            </span>
          </div>
        </div>

        {/* === Sticky nav === */}
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(10,10,18,0.7)] backdrop-blur-xl">
          <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-6">
            <div className="flex items-center gap-2.5">
              <span className="pulse-dot" />
              <span className="display text-[18px] font-extrabold tracking-[-0.04em]">Ximi4ka</span>
            </div>
            <Link
              href="/categories"
              className="mono inline-flex items-center gap-2 rounded-full bg-[var(--acid)] px-5 py-2.5 text-[13px] font-medium text-[var(--bg-0)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(167,139,250,0.25)]"
            >
              Открыть каталог
            </Link>
          </nav>
        </header>

        {/* === HERO — product-led === */}
        <section className="relative z-10 mx-auto max-w-[1280px] px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
          {/* Mono meta tags */}
          <div className="mono mb-12 flex flex-wrap gap-4 text-[12px] uppercase tracking-[0.08em] text-[var(--text-2)]">
            <span className="flex items-center gap-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--acid)] before:content-['']">
              {product?.sku ?? 'KIT-001'}
            </span>
            <span className="flex items-center gap-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--acid)] before:content-['']">
              Химия дома
            </span>
            <span className="flex items-center gap-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--acid)] before:content-['']">
              С 2017 года
            </span>
            <span className="flex items-center gap-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--acid)] before:content-['']">
              48 наборов в каталоге
            </span>
          </div>

          <div className="grid gap-12 lg:grid-cols-5 lg:items-center lg:gap-16">
            {/* Text column — 2/5 */}
            <div className="lg:col-span-2">
              <h1 className="display mb-8 text-[clamp(36px,5.5vw,76px)] leading-[1.05] tracking-[-0.045em]">
                Настоящая <span className="strike">химия в учебнике</span>{' '}
                <span className="acid-text">— не одна.</span>
                <br />
                Химия — у&nbsp;тебя дома.
              </h1>
              <p className="mb-10 max-w-xl text-[clamp(15px,1.4vw,18px)] leading-[1.6] text-[var(--text-1)]">
                Безопасные наборы для научных экспериментов с реактивами, посудой и подробной методичкой. Проверено химиками. Сертифицировано.
              </p>
              <div className="mb-8 flex flex-wrap items-center gap-5">
                <Link
                  href="/categories"
                  className="group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[var(--acid)] px-7 py-[16px] text-[15px] font-bold tracking-[-0.01em] text-[var(--bg-0)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(167,139,250,0.3)]"
                >
                  Открыть каталог
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" strokeWidth={2.5} />
                </Link>
              </div>
              <p className="mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-2)]">
                <span className="text-[var(--acid)]">15 000+</span> семей · <span className="text-[var(--acid)]">161</span> опыт · <span className="text-[var(--acid)]">48</span> наборов
              </p>
            </div>

            {/* Product anchor column — 3/5 */}
            <div className="lg:col-span-3">
              <div className="relative">
                {/* Top-left mono indicator */}
                <div className="mono absolute -top-1 left-2 z-20 text-[11px] uppercase tracking-[0.12em] text-[var(--acid)]">
                  01 / 04
                </div>
                {/* Top-right stock indicator */}
                <div className="mono absolute -top-1 right-2 z-20 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-2)]">
                  <span className="stock-dot" />
                  В наличии
                </div>

                {/* Product anchor */}
                <div className="product-anchor mt-8 flex aspect-[4/3] items-center justify-center bg-[rgba(167,139,250,0.04)] p-8 lg:p-12">
                  {product?.images?.[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.images[0].url}
                      alt={product.images[0].alt || product.name}
                      className="relative z-10 max-h-full max-w-full object-contain"
                      style={{ filter: 'drop-shadow(0 30px 60px rgba(167,139,250,0.45))' }}
                    />
                  ) : (
                    <div className="display text-3xl text-[var(--text-3)]">Химичка 3.0</div>
                  )}
                </div>

                {/* Spec strip below image — 4 separated pills with · separators */}
                <div className="mono mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.12em]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[var(--text-1)] backdrop-blur-md">
                    {product?.sku ?? '7V25'}
                  </span>
                  <span className="text-[var(--text-3)]">·</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[var(--text-1)] backdrop-blur-md">
                    161 опытов
                  </span>
                  <span className="text-[var(--text-3)]">·</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[var(--text-1)] backdrop-blur-md">
                    От 10 лет
                  </span>
                  <span className="text-[var(--text-3)]">·</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[var(--text-1)] backdrop-blur-md">
                    17 реактивов
                  </span>
                </div>

                {/* Product name + price */}
                {product && (
                  <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
                    <div>
                      <p className="display text-[clamp(24px,2.5vw,32px)] font-bold tracking-[-0.025em] text-[var(--text-0)]">
                        {product.name}
                      </p>
                      <p className="mono mt-1 text-[12px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                        FLAGSHIP · BEST SELLER
                      </p>
                    </div>
                    <p className="display text-[clamp(28px,3vw,40px)] font-bold tracking-[-0.03em] text-[var(--acid)]">
                      {ruble(product.priceRub)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* === Formula ticker === */}
        <div className="overflow-hidden whitespace-nowrap border-t border-b border-[var(--line)] bg-[var(--bg-1)] py-[18px]">
          <div className="ticker-track mono text-[14px] text-[var(--text-2)]">
            <FormulaTickerRow />
            <FormulaTickerRow />
          </div>
        </div>

        {/* === Catalog — numbered-rhythm grid === */}
        <section className="relative z-10 mx-auto max-w-[1280px] px-8 py-28">
          <div className="mono mb-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.1em] text-[var(--acid)]">
            <span className="block h-px w-8 bg-[var(--acid)]" />
            02 · Каталог
          </div>
          <h2 className="display mb-14 max-w-4xl text-[clamp(36px,5vw,64px)] tracking-[-0.035em]">
            48 <span className="acid-text">наборов</span> и реактивов{' '}
            <em className="display font-bold not-italic text-[var(--text-2)]">для всех уровней.</em>
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {carouselProducts.map((p, i) => (
              <CarouselCard key={p.id} product={p} index={i} total={carouselProducts.length} />
            ))}
          </div>
        </section>

        <div className="relative z-10 mx-auto max-w-[1280px] px-8 pb-20">
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-3)]">
            Preview D · Hybrid C+iyO/drinksom · This page is not part of the production site
          </p>
        </div>
      </main>
    </>
  )
}

function CarouselCard({
  product,
  index,
  total,
}: {
  product: Product
  index: number
  total: number
}) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="carousel-card group relative flex cursor-pointer flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--bg-1)] p-6 hover:border-[var(--line-bright)]"
    >
      {/* Numbered indicator */}
      <div className="mono flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[var(--text-3)]">
        <span className="text-[var(--acid)]">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <span>{product.sku ?? 'SKU'}</span>
      </div>

      {/* Product image with halo */}
      <div className="product-anchor relative flex aspect-square items-center justify-center bg-[rgba(167,139,250,0.04)] p-6">
        {product.images?.[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.images[0].url}
            alt={product.images[0].alt || product.name}
            className="relative z-10 max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-[1.04]"
            style={{ filter: 'drop-shadow(0 16px 32px rgba(167,139,250,0.3))' }}
          />
        ) : (
          <span className="display text-2xl text-[var(--text-3)]">{product.name}</span>
        )}
      </div>

      {/* Name + price */}
      <div className="mt-auto">
        <h3 className="display mb-1 line-clamp-2 text-[18px] font-bold tracking-[-0.02em] text-[var(--text-0)]">
          {product.name}
        </h3>
        <p className="mono text-[14px] text-[var(--acid)]">
          {new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0,
          }).format(product.priceRub)}
        </p>
      </div>
    </Link>
  )
}

function FormulaTickerRow() {
  return (
    <>
      <span className="text-[var(--text-1)]">CuSO₄ + Fe → FeSO₄ + Cu</span>
      <span>·</span>
      <span className="text-[var(--acid)]">2H₂O → 2H₂ + O₂</span>
      <span>·</span>
      <span className="text-[var(--text-1)]">NaOH + HCl → NaCl + H₂O</span>
      <span>·</span>
      <span className="text-[var(--acid)]">15 000+ семей с 2017</span>
      <span>·</span>
      <span className="text-[var(--text-1)]">161 опыт в наборе</span>
      <span>·</span>
      <span className="text-[var(--acid)]">17 реактивов · 6 пробирок</span>
      <span>·</span>
      <span className="text-[var(--text-1)]">2H₂O₂ → 2H₂O + O₂</span>
      <span>·</span>
      <span className="text-[var(--acid)]">CaCO₃ → CaO + CO₂</span>
      <span>·</span>
    </>
  )
}
