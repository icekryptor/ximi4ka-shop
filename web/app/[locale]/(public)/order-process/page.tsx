import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CdekTerms } from '@/components/marketing/CdekTerms'
import { DeliveryZones } from '@/components/marketing/DeliveryZones'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { buildMetadata } from '@/lib/metadata'
import { ORDER_STEPS, orderProcessPath } from '@/lib/orderProcess'

interface Props {
  params: Promise<{ locale: string }>
}

const PAGE_TITLE = 'Как проходит заказ и доставка'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, orderProcessPath(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: `${PAGE_TITLE} — Химичка`,
    metaDescription:
      'Как оформить заказ, оплатить и получить: условия бесплатной доставки в Россию, Беларусь и страны ЕАЭС, отправка в течение суток и сроки СДЭК по регионам.',
    pathname: orderProcessPath(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function OrderProcessPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: PAGE_TITLE, href: orderProcessPath(locale) },
  ]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} variant="catalog" />

      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-20">
          <header className="flex max-w-[48rem] flex-col gap-4">
            <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
              Как проходит заказ и доставка
            </h1>
            <p className="font-lj-body text-lg opacity-80">
              От корзины до посылки в руках: четыре шага, условия бесплатной доставки по странам и
              средние сроки СДЭК.
            </p>
          </header>

          {ORDER_STEPS.map((step) => (
            <section
              key={step.index}
              aria-labelledby={`step-${step.index}`}
              className="flex flex-col gap-6"
            >
              <h2
                id={`step-${step.index}`}
                className="font-lj-display text-2xl font-[700] tracking-[-0.03em]"
              >
                {step.index}. {step.title}
              </h2>
              <div className="flex max-w-[48rem] flex-col gap-4 font-lj-body text-base leading-[1.6]">
                {step.details.map((p) => (
                  <p key={p} className="m-0">
                    {p}
                  </p>
                ))}
              </div>

              {step.index === 1 && <DeliveryZones />}
              {step.index === 4 && <CdekTerms />}

              {step.screenshots.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  {step.screenshots.map((shot) => (
                    <figure key={shot.src} className="m-0 flex flex-col gap-2">
                      <Image
                        src={shot.src}
                        alt={shot.alt}
                        width={shot.width}
                        height={shot.height}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="h-auto w-full border border-[var(--color-lj-rule)]"
                      />
                      <figcaption className="font-lj-mono text-[length:var(--text-lj-mono-sm)] tracking-[0.04em] opacity-70">
                        {shot.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          ))}

          <p className="max-w-[48rem] font-lj-body text-base">
            Риск случайной гибели или повреждения товара переходит к Покупателю с момента передачи
            товара службе доставки. Полные условия покупки — в{' '}
            <Link href="/oferta" className="underline underline-offset-4">
              публичной оферте
            </Link>
            .
          </p>

          <p>
            <Link
              href="/categories"
              className="inline-flex rounded-full bg-[var(--color-lj-ink)] px-6 py-3 font-lj-body text-base font-[600] text-[var(--color-lj-bone)]"
            >
              Открыть каталог
            </Link>
          </p>
        </div>
      </LabSection>
    </>
  )
}
