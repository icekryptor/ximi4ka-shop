import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LabSection } from '@/components/ui/LabSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { WholesaleOrder } from '@/components/wholesale/WholesaleOrder'
import { WholesaleTiersTable } from '@/components/wholesale/WholesaleTiersTable'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'

interface Props {
  params: Promise<{ locale: string }>
}

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/opt' : `/${locale}/opt`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: 'Оптовый заказ наборов, реактивов и оборудования — Химичка',
    metaDescription:
      'Закажите наборы Химичка, реактивы, оборудование, пробирки и пипетки оптом со скидкой: найдите позиции, выберите количество и сразу увидьте цену.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function OptPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: 'Оптом', href: pathForLocale(locale) },
  ]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} variant="catalog" />

      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-16">
          <header className="flex max-w-[48rem] flex-col gap-4">
            <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
              Оптом дешевле
            </h1>
            <p className="font-lj-body text-lg opacity-80">
              Школам, онлайн-школам и магазинам: соберите список, посмотрите цену с оптовой скидкой
              и отправьте его в корзину.
            </p>
          </header>

          <section aria-labelledby="opt-order" className="flex flex-col gap-6">
            <h2 id="opt-order" className="font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Собрать заказ
            </h2>
            <WholesaleOrder catalogPerView={6} />
          </section>

          <section aria-labelledby="opt-tiers" className="flex flex-col gap-6">
            <h2 id="opt-tiers" className="font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Как считается скидка
            </h2>
            <WholesaleTiersTable />
            <p className="font-lj-body text-sm opacity-70">
              Скидка считается на каждую позицию отдельно: каждый набор — по своему количеству,
              реагенты и другой товар — тоже по своему. Несколько разных наборов можно взять комбо:
              на небольших количествах оно выходит дешевле.
            </p>
          </section>

          <p className="font-lj-body text-base">
            Нужен заказ крупнее или счёт для организации?{' '}
            <Link href="/collab" className="underline underline-offset-4">
              Напишите нам о сотрудничестве
            </Link>
            .
          </p>
        </div>
      </LabSection>
    </>
  )
}
