import Link from 'next/link'
import {
  Truck,
  ShieldCheck,
  BookOpen,
  Award,
  ArrowRight,
} from 'lucide-react'
import { getPublishedProduct } from '@/lib/api'
import type { Product } from '@ximi4ka-shop/shared'

// v3 Preview B — Direction B (saturated, illustrated, kinetic). Counterpart
// to /v3-preview (Direction A — Premium Editorial Glass). Same product
// (Химичка 3.0) and bento composition, executed in a vibrant block-based
// visual language: cream butter background, saturated brand-color cells,
// chunky Tinkoff-style sharp `8px 8px 0 #1c1528` shadows, playful tilts at
// the lg+ breakpoint.
//
// Mobile note: tilt + chunky shadow can clip on narrow viewports where cells
// stack vertically, so all `transform: rotate(...)` and the chunky shadow are
// applied only at the `lg:` breakpoint via inline `<style>` rules below. On
// mobile cells are clean, flat, and full-width.

export const dynamic = 'force-dynamic'

async function fetchHero(): Promise<{ product: Product | null }> {
  try {
    const product = await getPublishedProduct('himichka-30')
    return { product }
  } catch {
    return { product: null }
  }
}

export default async function V3PreviewB() {
  const { product } = await fetchHero()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAF6E6] text-[#1c1528]">
      {/* Mobile-safe tilt + chunky shadow: only apply at >= 1024px (lg).
          Cells get classes like `vb-tilt-left` / `vb-shadow-chunky` and the
          rules activate inside the @media block. Below lg the bento collapses
          to a single column and we want flat, untilted cells anyway. */}
      <style>{`
        @media (min-width: 1024px) {
          .vb-tilt-left { transform: rotate(-1deg); }
          .vb-tilt-right { transform: rotate(1deg); }
          .vb-shadow-chunky { box-shadow: 8px 8px 0 #1c1528; }
          .vb-shadow-chunky-sm { box-shadow: 4px 4px 0 #1c1528; }
          .vb-shadow-chunky-xs { box-shadow: 3px 3px 0 #1c1528; }
          .vb-shadow-chunky-2xs { box-shadow: 2px 2px 0 #1c1528; }
        }
      `}</style>

      {/* Decorative flat blobs (no blur — sharp circles). Low opacity, behind
          everything. Adds the Tinkoff/KiwiCo backdrop feel without competing
          with the cells. */}
      <BackgroundBlobs />

      {/* Top preview ribbon */}
      <div className="relative z-50 border-b-2 border-[#1c1528] bg-[#1c1528] px-6 py-2">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-[#FFD700]">
          <span>Ximi4ka v3 · preview B</span>
          <Link
            href="/v3-preview"
            className="text-[#FFD700]/60 transition hover:text-[#FFD700]"
          >
            Compare with A →
          </Link>
        </div>
      </div>

      {/* Hero bento */}
      <section className="relative z-10 mx-auto max-w-[1280px] px-6 pt-12 pb-24 lg:pt-20">
        <div
          className="grid gap-6 lg:grid-cols-5 lg:grid-rows-3 lg:gap-8"
          style={{ minHeight: 'min(72vh, 720px)' }}
        >
          {/* Cell 1 — Yellow copy block, tilted -1deg at lg+ */}
          <div className="vb-tilt-left vb-shadow-chunky relative rounded-[36px] bg-[#FFD700] p-8 lg:col-span-3 lg:row-span-2 lg:p-12">
            <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#1c1528]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#FF6B35]" />
              Лаборатория дома · с 2017
            </span>
            <h1 className="mt-6 font-[var(--font-display)] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.04em] text-[#1c1528]">
              Настоящая <span className="text-[#836efe]">химия</span>{' '}
              для&nbsp;дома.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#1c1528]/85">
              Безопасные наборы для научных экспериментов с подробной
              методичкой. Создаём с 2017 года, проверено химиками,
              сертифицировано.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/categories"
                className="vb-shadow-chunky-sm group inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#836efe] px-8 py-4 text-[15px] font-bold text-white transition hover:scale-[1.03]"
              >
                Смотреть наборы
                <ArrowRight
                  className="h-4 w-4 transition group-hover:translate-x-1"
                  strokeWidth={3}
                />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-[#1c1528] px-8 py-3.5 text-[15px] font-bold text-[#1c1528] transition hover:bg-[#1c1528] hover:text-[#FFD700]"
              >
                Как это работает
              </Link>
            </div>
            {/* Decorative beaker SVG bottom-right */}
            <BeakerIllustration className="absolute bottom-6 right-6 h-20 w-20 text-[#1c1528] opacity-40" />
          </div>

          {/* Cell 2 — Purple product block (no tilt) */}
          <div className="vb-shadow-chunky relative overflow-hidden rounded-[36px] bg-[#836efe] p-8 lg:col-span-2 lg:row-span-3 lg:p-10">
            <span className="vb-shadow-chunky-xs absolute top-6 left-6 z-20 inline-block rounded-full bg-[#FF6B35] px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-white" style={{ transform: 'rotate(-6deg)' }}>
              ХИТ
            </span>
            <span className="vb-shadow-chunky-xs absolute top-6 right-6 z-20 inline-block rounded-full bg-[#FFD700] px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[#1c1528]" style={{ transform: 'rotate(6deg)' }}>
              −6%
            </span>
            <span className="vb-shadow-chunky-xs absolute bottom-44 left-6 z-20 inline-block rounded-full bg-[#FAF6E6] px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[#1c1528]" style={{ transform: 'rotate(-3deg)' }}>
              От 10 лет
            </span>

            {/* Product image */}
            <div className="relative z-10 flex h-full items-center justify-center">
              {product?.images?.[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={product.images[0].url}
                  alt={product.images[0].alt || product.name}
                  className="max-h-full max-w-full object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.25)]"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-white/10 text-sm text-white/60">
                  Химичка 3.0
                </div>
              )}
            </div>

            {/* Bottom name + price overlay */}
            {product && (
              <div className="absolute right-6 bottom-6 left-6 z-20 rounded-2xl bg-white/95 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1528]/60">
                  {product.sku ?? 'SKU'}
                </p>
                <p className="mt-1 text-base font-bold text-[#1c1528]">
                  {product.name}
                </p>
                <p className="mt-1 font-[var(--font-display)] text-3xl tracking-tight text-[#1c1528]">
                  {new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                    maximumFractionDigits: 0,
                  }).format(product.priceRub)}
                </p>
              </div>
            )}
          </div>

          {/* Cell 3 — Orange stat block, tilted +1deg at lg+ */}
          <div className="vb-tilt-right vb-shadow-chunky relative rounded-[36px] bg-[#FF6B35] p-8 lg:col-span-1 lg:row-span-1">
            <div className="flex h-full flex-col justify-between gap-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1c1528]/70">
                В одном наборе
              </span>
              <div>
                <span className="block font-[var(--font-display)] text-[clamp(3.5rem,6vw,5rem)] leading-[0.85] tracking-[-0.05em] text-[#1c1528]">
                  161
                </span>
                <span className="mt-1 block text-sm font-bold uppercase tracking-[0.15em] text-[#1c1528]">
                  опыт
                </span>
              </div>
            </div>
          </div>

          {/* Cell 4 — Trust 4-icon block (cream, with dark border) */}
          <div className="vb-shadow-chunky relative rounded-[36px] border-2 border-[#1c1528] bg-[#FAF6E6] p-6 lg:col-span-2 lg:row-span-1">
            <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4">
              <TrustIconItem
                icon={<Truck className="h-5 w-5" strokeWidth={2.25} />}
                label="Доставка по России"
                bg="#836efe"
              />
              <TrustIconItem
                icon={<ShieldCheck className="h-5 w-5" strokeWidth={2.25} />}
                label="Безопасные реактивы"
                bg="#FF6B35"
              />
              <TrustIconItem
                icon={<BookOpen className="h-5 w-5" strokeWidth={2.25} />}
                label="Методичка в наборе"
                bg="#FFD700"
                iconColor="#1c1528"
              />
              <TrustIconItem
                icon={<Award className="h-5 w-5" strokeWidth={2.25} />}
                label="Сертифицировано"
                bg="#FF6B9D"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 pb-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1528]/40">
          Preview B · This page is not part of the production site
        </p>
      </div>
    </main>
  )
}

function BackgroundBlobs() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Yellow blob bottom-left */}
      <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#FFD700] opacity-40" />
      {/* Purple oval top-right */}
      <div className="absolute -top-20 -right-40 h-[500px] w-[700px] rounded-full bg-[#836efe] opacity-15" />
      {/* Orange small mid-left */}
      <div className="absolute top-1/3 left-1/4 h-[200px] w-[200px] rounded-full bg-[#FF6B35] opacity-10" />
    </div>
  )
}

// Custom flat-style flask/beaker illustration. Inline SVG, dark outline,
// transparent fill, plus three filled "bubbles" inside. Sized via the parent
// className.
function BeakerIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M30 8 V25 L18 60 a8 8 0 0 0 8 12 h28 a8 8 0 0 0 8 -12 L50 25 V8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <line
        x1="26"
        y1="8"
        x2="54"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="32" cy="50" r="3" fill="currentColor" />
      <circle cx="44" cy="55" r="2" fill="currentColor" />
      <circle cx="38" cy="60" r="2.5" fill="currentColor" />
    </svg>
  )
}

function TrustIconItem({
  icon,
  label,
  bg,
  iconColor = '#FFFFFF',
}: {
  icon: React.ReactNode
  label: string
  bg: string
  iconColor?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="vb-shadow-chunky-2xs flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: bg, color: iconColor }}
      >
        {icon}
      </div>
      <span className="pt-1 text-xs font-bold leading-tight text-[#1c1528]">
        {label}
      </span>
    </div>
  )
}
