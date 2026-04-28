import Link from 'next/link'
import {
  Truck,
  ShieldCheck,
  BookOpen,
  Award,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { getPublishedProduct } from '@/lib/api'
import type { Product } from '@ximi4ka-shop/shared'

// v3 Preview — single isolated showcase page demonstrating the
// "Premium Editorial Glass / Liquid Glass / Bento Grid" direction.
// Lives outside [locale]/(public) and is excluded from the locale-rewriting
// middleware (see web/middleware.ts EXCLUDED_PREFIXES). Renders chromeless
// (no Header/Footer) so the hero stands alone for evaluation.
//
// Real data: pulls "Химичка 3.0" via the existing public API client. Falls
// back gracefully if the product isn't seeded.

export const dynamic = 'force-dynamic'

async function fetchHero(): Promise<{ product: Product | null }> {
  try {
    const product = await getPublishedProduct('himichka-30')
    return { product }
  } catch {
    return { product: null }
  }
}

export default async function V3Preview() {
  const { product } = await fetchHero()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-dark-deep)] text-[var(--color-text-on-dark)]">
      {/* Gradient mesh background — 3 radial blooms */}
      <GradientMesh />

      {/* Subtle dot grid pattern (very low opacity) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Top label strip — preview banner */}
      <div className="relative z-50 border-b border-white/5 bg-black/30 px-6 py-2 backdrop-blur">
        <div
          className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-white/50"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>Ximi4ka v3 · preview</span>
          <Link
            href="/"
            className="text-white/40 transition hover:text-white/80"
          >
            Compare with v2 →
          </Link>
        </div>
      </div>

      {/* Hero bento grid */}
      <section className="relative z-10 mx-auto max-w-[1280px] px-6 pt-12 pb-24 lg:pt-20 lg:pb-32">
        <div
          className="grid gap-4 lg:grid-cols-5 lg:grid-rows-3 lg:gap-5"
          style={{ minHeight: 'min(72vh, 720px)' }}
        >
          {/* Cell 1 — Big copy (left, spans 3 cols × 2 rows) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--color-glass-dark)] p-8 backdrop-blur-2xl lg:col-span-3 lg:row-span-2 lg:p-12">
            <div className="flex h-full flex-col justify-between">
              <div>
                <span
                  className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.25em] text-white/55"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <Sparkles
                    className="h-3 w-3 text-[var(--color-gold)]"
                    strokeWidth={2.5}
                  />
                  Лаборатория дома · с 2017
                </span>
                <h1 className="mt-6 font-[var(--font-display)] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.04em] text-white">
                  Настоящая{' '}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{ backgroundImage: 'var(--gradient-gold)' }}
                  >
                    химия
                  </span>
                  {' '}для&nbsp;дома.
                </h1>
                <p className="mt-6 max-w-xl text-[length:var(--text-lead)] leading-relaxed text-white/65">
                  Безопасные наборы для научных экспериментов с подробной
                  методичкой. Создаём с 2017 года, проверено химиками,
                  сертифицировано.
                </p>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                {/* Primary CTA — gold gradient */}
                <Link
                  href="/categories"
                  className="group inline-flex cursor-pointer items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold text-[#1A0F00] shadow-[0_8px_30px_-8px_rgba(202,138,4,0.6)] transition hover:scale-[1.02]"
                  style={{ backgroundImage: 'var(--gradient-gold)' }}
                >
                  Смотреть наборы
                  <ArrowRight
                    className="h-4 w-4 transition group-hover:translate-x-1"
                    strokeWidth={2.5}
                  />
                </Link>

                {/* Secondary CTA — ghost */}
                <Link
                  href="#how-it-works"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-[15px] font-medium text-white/85 transition hover:border-white/40 hover:bg-white/5"
                >
                  Как это работает
                </Link>
              </div>
            </div>
          </div>

          {/* Cell 2 — Hero product (right, spans 2 cols × 3 rows) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--color-glass-dark)] p-8 backdrop-blur-2xl lg:col-span-2 lg:row-span-3 lg:p-10">
            {/* Product photo backdrop — color-tinted radial */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 40%, rgba(141,103,255,0.20) 0%, transparent 70%)',
              }}
            />

            {/* Sticker badges */}
            <span
              className="absolute top-6 left-6 z-20 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#1A0F00] shadow-lg"
              style={{
                backgroundImage: 'var(--gradient-gold)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ХИТ
            </span>
            <span
              className="absolute top-6 right-6 z-20 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-white shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6703ff, #c856ff)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              −6%
            </span>
            <span
              className="absolute bottom-6 left-6 z-20 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-white/85 backdrop-blur-md"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              От 10 лет
            </span>

            {/* Product image */}
            <div className="relative z-10 flex h-full items-center justify-center">
              {product?.images?.[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={product.images[0].url}
                  alt={product.images[0].alt || product.name}
                  className="max-h-full max-w-full object-contain drop-shadow-[0_30px_60px_rgba(141,103,255,0.4)]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-white/30">
                  Product image
                </div>
              )}
            </div>

            {/* Bottom name + price overlay */}
            {product && (
              <div className="absolute right-6 bottom-6 z-20 max-w-[60%] rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl">
                <p
                  className="truncate text-xs font-medium text-white/60"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {product.sku ?? 'SKU'}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-white">
                  {product.name}
                </p>
                <p className="mt-1 font-[var(--font-display)] text-2xl tracking-tight text-white">
                  {new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                    maximumFractionDigits: 0,
                  }).format(product.priceRub)}
                </p>
              </div>
            )}
          </div>

          {/* Cell 3 — Stat (bottom-left, spans 1 col × 1 row) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--color-glass-dark)] p-8 backdrop-blur-2xl lg:col-span-1 lg:row-span-1">
            <div className="flex h-full flex-col justify-between">
              <span
                className="text-[10px] font-medium uppercase tracking-[0.25em] text-white/45"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                В одном наборе
              </span>
              <div>
                <span
                  className="block bg-clip-text font-[var(--font-display)] text-[clamp(3.5rem,6vw,5rem)] leading-[0.85] tracking-[-0.05em] text-transparent"
                  style={{ backgroundImage: 'var(--gradient-gold)' }}
                >
                  161
                </span>
                <span
                  className="mt-1 block text-sm text-white/65"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  опыт
                </span>
              </div>
            </div>
          </div>

          {/* Cell 4 — Trust 4-icon row (bottom-middle, spans 2 cols × 1 row) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--color-glass-dark)] p-6 backdrop-blur-2xl lg:col-span-2 lg:row-span-1">
            <div className="grid h-full grid-cols-2 gap-4 sm:grid-cols-4">
              <TrustIconItem
                icon={<Truck className="h-5 w-5" strokeWidth={1.75} />}
                label="Доставка по России"
              />
              <TrustIconItem
                icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
                label="Безопасные реактивы"
              />
              <TrustIconItem
                icon={<BookOpen className="h-5 w-5" strokeWidth={1.75} />}
                label="Методичка в наборе"
              />
              <TrustIconItem
                icon={<Award className="h-5 w-5" strokeWidth={1.75} />}
                label="Сертифицировано"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer hint */}
      <div className="relative z-10 mx-auto max-w-[1280px] px-6 pb-16">
        <p
          className="text-[11px] uppercase tracking-[0.2em] text-white/30"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Preview · This page is not part of the production site
        </p>
      </div>
    </main>
  )
}

function GradientMesh() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Top-right purple bloom */}
      <div
        className="absolute -top-1/4 -right-1/4 h-[80vh] w-[80vh] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(141,103,255,0.6) 0%, transparent 70%)',
        }}
      />
      {/* Bottom-left gold bloom */}
      <div
        className="absolute -bottom-1/4 -left-1/4 h-[60vh] w-[60vh] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(202,138,4,0.5) 0%, transparent 70%)',
        }}
      />
      {/* Center magenta accent */}
      <div
        className="absolute top-1/3 right-1/3 h-[50vh] w-[50vh] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(200,86,255,0.5) 0%, transparent 70%)',
        }}
      />
    </div>
  )
}

function TrustIconItem({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--color-gold)]">
        {icon}
      </div>
      <span className="pt-1.5 text-xs leading-tight font-medium text-white/75">
        {label}
      </span>
    </div>
  )
}
