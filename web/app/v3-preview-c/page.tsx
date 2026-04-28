import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getPublishedProduct, listPublishedProducts } from '@/lib/api'
import type { Product } from '@ximi4ka-shop/shared'

// v3 Preview C — Direction C: Lab-Tech / Acid.
//
// Synthesized from the user's own landing page DNA
// (~/Downloads/experimentality_landing_purple.html). Mirrors that page's
// vocabulary: dark canvas, graph-paper grid bg, Syne display headings,
// Manrope body, JetBrains Mono labels, acid-violet accent, mixed-treatment
// H1 (strike-through + italic acid), formula ticker, pulsing-dot logo.
//
// PREVIEW-ONLY: tokens are inlined in a <style> tag scoped to `.v3c` so
// nothing leaks into v2 production. This route is excluded from middleware
// (locale rewrites, redirects) and the layout is chromeless.

export const dynamic = 'force-dynamic'

const TOKENS = `
  .v3c {
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
    --pink: #ff7ad9;
    background: var(--bg-0);
    color: var(--text-0);
    font-family: var(--font-manrope), 'Manrope', sans-serif;
    background-image:
      radial-gradient(circle at 12% 8%, rgba(167,139,250,0.08), transparent 35%),
      radial-gradient(circle at 88% 92%, rgba(92,182,255,0.05), transparent 40%);
    -webkit-font-smoothing: antialiased;
  }
  /* Syne lacks Cyrillic on Google Fonts. The browser does per-glyph
     fallback through the font stack — Latin chars render in Syne, Cyrillic
     chars fall through to Manrope (ExtraBold via font-weight). */
  .v3c .display {
    font-family: var(--font-syne), var(--font-manrope), 'Syne', 'Manrope', sans-serif;
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  .v3c .mono {
    font-family: var(--font-jetbrains), 'JetBrains Mono', monospace;
    font-feature-settings: 'ss01';
    letter-spacing: -0.02em;
  }
  .v3c .grid-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      linear-gradient(rgba(167,139,250,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(167,139,250,0.025) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  }
  .v3c .noise {
    position: fixed; inset: 0; pointer-events: none; z-index: 1;
    opacity: 0.04; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .v3c .strike { position: relative; display: inline-block; color: var(--text-2); }
  .v3c .strike::after {
    content: ''; position: absolute; left: -2%; right: -2%; top: 52%;
    height: 6px; background: var(--warn); transform: rotate(-2deg);
  }
  .v3c .acid-text {
    color: var(--acid);
    font-style: italic;
    font-weight: 800;
    font-family: var(--font-syne), var(--font-manrope), 'Syne', 'Manrope', sans-serif;
  }
  .v3c .pulse-dot {
    width: 10px; height: 10px;
    background: var(--acid);
    border-radius: 50%;
    box-shadow: 0 0 12px var(--acid);
    animation: v3c-pulse 2s ease-in-out infinite;
  }
  @keyframes v3c-pulse {
    0%, 100% { box-shadow: 0 0 8px var(--acid); transform: scale(1); }
    50% { box-shadow: 0 0 18px var(--acid); transform: scale(1.15); }
  }
  .v3c .ticker-track {
    display: inline-flex; gap: 48px;
    animation: v3c-ticker 60s linear infinite;
    white-space: nowrap;
    width: max-content;
  }
  .v3c .ticker:hover .ticker-track { animation-play-state: paused; }
  @keyframes v3c-ticker {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .v3c .pulse-dot { animation: none; }
    .v3c .ticker-track { animation: none; }
  }
`

interface FetchData {
  product: Product | null
  products: Product[]
}

async function fetchData(): Promise<FetchData> {
  try {
    const [product, list] = await Promise.all([
      getPublishedProduct('himichka-30').catch(() => null),
      listPublishedProducts({ limit: 4 }).catch(() => null),
    ])
    return { product, products: list?.data ?? [] }
  } catch {
    return { product: null, products: [] }
  }
}

export default async function V3PreviewC() {
  const { product, products } = await fetchData()
  const heroProducts = products.slice(0, 4)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      <main className="v3c relative min-h-screen overflow-x-hidden">
        <div className="grid-bg" />
        <div className="noise" />

        {/* Top preview ribbon — links between A/B/C and v2 for comparison. */}
        <div className="relative z-50 border-b border-[var(--line)] bg-black/30 px-8 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] mono uppercase tracking-[0.2em] text-[var(--text-2)]">
            <span>Ximi4ka v3 · preview C</span>
            <span className="space-x-4">
              <Link href="/v3-preview" className="text-[var(--text-3)] hover:text-[var(--acid)] transition">A</Link>
              <Link href="/v3-preview-b" className="text-[var(--text-3)] hover:text-[var(--acid)] transition">B</Link>
              <Link href="/" className="text-[var(--text-3)] hover:text-[var(--acid)] transition">v2</Link>
            </span>
          </div>
        </div>

        {/* Sticky nav with pulsing-dot logo */}
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

        {/* HERO */}
        <section className="relative z-10 mx-auto max-w-[1280px] overflow-hidden px-8 pb-24 pt-20 lg:pb-32 lg:pt-28">
          {/* Mono meta tags — SKU, category, since-year, catalog count. */}
          <div className="mono mb-10 flex flex-wrap gap-4 text-[12px] uppercase tracking-[0.08em] text-[var(--text-2)]">
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

          {/* Mega H1 — strike on "химия в учебнике", acid-italic on "не одна". */}
          <h1 className="display mb-8 max-w-5xl text-[clamp(48px,8vw,112px)] leading-[1.05] tracking-[-0.045em]">
            Настоящая <span className="strike">химия в учебнике</span>{' '}
            <span className="acid-text">— не одна.</span>
            <br />
            Химия — у тебя дома.
          </h1>

          <p className="mb-12 max-w-2xl text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[var(--text-1)]">
            Безопасные наборы для научных экспериментов с реактивами, посудой и подробной методичкой. Проверено химиками. Сертифицировано.
          </p>

          <div className="mb-14 flex flex-wrap items-center gap-5">
            <Link
              href="/categories"
              className="group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[var(--acid)] px-8 py-[18px] text-[16px] font-bold tracking-[-0.01em] text-[var(--bg-0)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(167,139,250,0.3)]"
            >
              Открыть каталог
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" strokeWidth={2.5} />
            </Link>
            <span className="mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-2)]">
              <span className="text-[var(--acid)]">15 000+</span> семей · <span className="text-[var(--acid)]">161</span> опыт
            </span>
          </div>

          {/* Floating molecule SVG (lg+ only) */}
          <div className="pointer-events-none absolute right-[-50px] top-24 hidden h-[480px] w-[480px] opacity-95 lg:block">
            <MoleculeVisual />
          </div>
        </section>

        {/* Formula ticker — pauses on hover via CSS. */}
        <div className="ticker overflow-hidden whitespace-nowrap border-b border-t border-[var(--line)] bg-[var(--bg-1)] py-[18px]">
          <div className="ticker-track mono text-[14px] text-[var(--text-2)]">
            <FormulaTickerRow />
            <FormulaTickerRow />
          </div>
        </div>

        {/* Catalog section */}
        <section className="relative z-10 mx-auto max-w-[1280px] px-8 py-32">
          <div className="mono mb-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.1em] text-[var(--acid)]">
            <span className="block h-px w-8 bg-[var(--acid)]" />
            01 · Каталог
          </div>
          <h2 className="display mb-14 max-w-4xl text-[clamp(36px,5vw,64px)] tracking-[-0.035em]">
            48 <span className="acid-text">наборов</span> и реактивов{' '}
            <em className="display font-bold not-italic text-[var(--text-2)]">для всех уровней.</em>
          </h2>

          <div className="grid gap-px overflow-hidden rounded-[4px] border border-[var(--line)] bg-[var(--line)] md:grid-cols-2 lg:grid-cols-4">
            {heroProducts.map((p, i) => (
              <CardC key={p.id} product={p} index={i} />
            ))}
            {heroProducts.length < 4 &&
              Array.from({ length: 4 - heroProducts.length }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-[3/4] bg-[var(--bg-1)]" />
              ))}
          </div>
        </section>

        <div className="relative z-10 mx-auto max-w-[1280px] px-8 pb-20">
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-3)]">
            Preview C · This page is not part of the production site
          </p>
        </div>
      </main>
    </>
  )
}

function CardC({ product, index }: { product: Product; index: number }) {
  const formattedPrice = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(product.priceRub)

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group relative flex cursor-pointer flex-col gap-6 bg-[var(--bg-1)] p-8 transition hover:bg-[var(--bg-2)]"
    >
      <span className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-3)]">
        {String(index + 1).padStart(2, '0')} / {product.sku ?? 'SKU'}
      </span>

      <div className="relative flex aspect-square items-center justify-center">
        {product.images?.[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.images[0].url}
            alt={product.images[0].alt || product.name}
            className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="display text-3xl text-[var(--text-3)]">{product.name}</span>
        )}
      </div>

      <div className="mt-auto">
        <h3 className="display mb-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--text-0)]">
          {product.name}
        </h3>
        <p className="mono text-[14px] text-[var(--acid)]">{formattedPrice}</p>
      </div>

      {/* Hover acid underline */}
      <span className="absolute bottom-0 left-8 right-8 h-px origin-left scale-x-0 bg-[var(--acid)] transition-transform duration-300 group-hover:scale-x-100" />
    </Link>
  )
}

function MoleculeVisual() {
  // Abstract 5-node molecule with acid stroke. Inline labels echo the
  // chemistry vocabulary of the formula ticker without being a real diagram.
  return (
    <svg viewBox="0 0 480 480" fill="none" className="h-full w-full">
      <defs>
        <radialGradient id="v3c-acid-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="240" cy="240" r="200" fill="url(#v3c-acid-glow)" />
      <g stroke="#a78bfa" strokeWidth="1.5" fill="none" opacity="0.8">
        <line x1="120" y1="180" x2="240" y2="240" />
        <line x1="240" y1="240" x2="360" y2="180" />
        <line x1="240" y1="240" x2="240" y2="360" />
        <line x1="120" y1="180" x2="240" y2="120" />
        <line x1="240" y1="120" x2="360" y2="180" />
      </g>
      <g fill="#0a0a12" stroke="#a78bfa" strokeWidth="2">
        <circle cx="120" cy="180" r="20" />
        <circle cx="240" cy="240" r="28" />
        <circle cx="360" cy="180" r="20" />
        <circle cx="240" cy="120" r="16" />
        <circle cx="240" cy="360" r="24" />
      </g>
      <g
        fill="#a78bfa"
        fontSize="11"
        textAnchor="middle"
        fontFamily="var(--font-jetbrains), monospace"
      >
        <text x="120" y="184">Cu</text>
        <text x="240" y="245">SO₄</text>
        <text x="360" y="184">H₂O</text>
        <text x="240" y="124">Fe</text>
        <text x="240" y="365">2H</text>
      </g>
    </svg>
  )
}

function FormulaTickerRow() {
  // Two copies of this row are rendered in the ticker so the loop is
  // seamless when transform: translateX(-50%) lands.
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
