import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { buildMetadata } from '@/lib/metadata'
import { SPLIT_HELP_URL, SPLIT_RULES_URL, splitGuidePath } from '@/lib/splitGuide'

interface Props {
  params: Promise<{ locale: string }>
}

const PAGE_TITLE = 'Как оплатить в Сплит'

// Шаги — по порядку экрана: наш чекаут, затем форма Яндекс Пэй, затем возврат на страницу заказа.
const STEPS = [
  'В корзине нажмите «Оформить заказ», заполните контакты и доставку, в блоке «Способ оплаты» выберите «Сплит — оплата частями» и нажмите «Оформить заказ».',
  'Откроется платёжная форма Яндекс Пэй — в ней уже выбран Сплит.',
  'Войдите в Яндекс ID или создайте его и подтвердите номер телефона.',
  'Яндекс за несколько секунд проверит, доступен ли вам Сплит.',
  'Выберите карту или добавьте новую и подтвердите оформление — иногда для этого нужен код из СМС.',
  'Сразу спишется первый платёж — четверть суммы заказа. Если сумма больше вашего лимита Сплита, разница добавится к первому платежу.',
  'После оплаты вы вернётесь на страницу заказа. Статус «Оплачен» появится автоматически — обычно сразу, иногда через несколько минут.',
]

const SECTION_H2 = 'font-lj-display text-2xl font-[700] tracking-[-0.03em]'
const BODY = 'flex max-w-[48rem] flex-col gap-3 font-lj-body text-base leading-[1.6]'
const LIST = 'm-0 flex flex-col gap-2 pl-5'
const LINK = 'underline underline-offset-4'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, splitGuidePath(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: `${PAGE_TITLE} — Химичка`,
    metaDescription:
      'Как оплатить заказ через Яндекс Сплит: 4 платежа за 2 месяца без переплат. Пошагово: оформление, кому доступен Сплит, график платежей и возврат.',
    pathname: splitGuidePath(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function SplitGuidePage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: PAGE_TITLE, href: splitGuidePath(locale) },
  ]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} variant="catalog" />

      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-16">
          <header className="flex max-w-[48rem] flex-col gap-4">
            <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
              {PAGE_TITLE}
            </h1>
            <p className="font-lj-body text-lg opacity-80">
              Сплит — оплата частями от Яндекса. Обычный Сплит — 4 платежа за 2 месяца без переплат:
              четверть суммы списывается сразу, остальное — тремя платежами раз в две недели.
            </p>
          </header>

          <section aria-labelledby="split-how" className="flex flex-col gap-6">
            <h2 id="split-how" className={SECTION_H2}>
              Как оплатить
            </h2>
            <ol aria-label="Шаги оплаты в Сплит" className={`${BODY} ${LIST} list-decimal`}>
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="split-who" className="flex flex-col gap-6">
            <h2 id="split-who" className={SECTION_H2}>
              Кому доступен Сплит
            </h2>
            <ul className={`${BODY} ${LIST} list-disc`}>
              <li>
                Гражданам России от 18 лет (по правилам Сплита — не старше 70) с российским номером
                телефона и Яндекс ID.
              </li>
              <li>
                Нужна банковская карта — дебетовая или кредитная. Виртуальные, корпоративные и
                предоплаченные карты не подходят; срок действия карты должен быть больше двух
                месяцев. По кредитной карте банк может взять свою комиссию.
              </li>
              <li>
                Лимит у каждого свой, и одобрение не гарантировано: Яндекс проверяет каждую покупку
                при оформлении. Доступный лимит виден в личном кабинете Сплита и в приложении Яндекс
                Пэй.
              </li>
              <li>
                При доставке в Беларусь, Казахстан, Армению и Киргизию Сплит недоступен — заказ
                оплачивается картой.
              </li>
            </ul>
          </section>

          <section aria-labelledby="split-after" className="flex flex-col gap-6">
            <h2 id="split-after" className={SECTION_H2}>
              После покупки
            </h2>
            <ul className={`${BODY} ${LIST} list-disc`}>
              <li>
                Оставшиеся платежи списываются с карты автоматически раз в две недели, перед каждым
                приходит напоминание.
              </li>
              <li>
                График — в личном кабинете Сплита и в приложении Яндекс Пэй. Даты платежей
                фиксированные.
              </li>
              <li>Можно заплатить досрочно — следующую часть или всю оставшуюся сумму.</li>
              <li>
                Если списание не прошло, Сплит повторяет попытку раз в сутки. По правилам сервиса
                неустойку за просрочку в обычном Сплите оператор не берёт, но может отказать в
                Сплите в будущем.
              </li>
            </ul>
          </section>

          <section aria-labelledby="split-declined" className="flex flex-col gap-6">
            <h2 id="split-declined" className={SECTION_H2}>
              Если Сплит не одобрили
            </h2>
            <div className={BODY}>
              <p className="m-0">
                В той же форме Яндекс Пэй можно оплатить заказ картой целиком. Если оплатить не
                получилось, заказ сохранится — напишите нам, и мы поможем.
              </p>
            </div>
          </section>

          <section aria-labelledby="split-return" className="flex flex-col gap-6">
            <h2 id="split-return" className={SECTION_H2}>
              Возврат
            </h2>
            <div className={BODY}>
              <p className="m-0">
                Возврат оформляется как обычно, по{' '}
                <Link href="/return" className={LINK}>
                  правилам магазина
                </Link>
                . Если вернуть часть товаров, сумма в Сплите уменьшится и следующие платежи
                пересчитаются. Деньги вернутся на карты, с которых вы платили, — в течение 7 рабочих
                дней после того, как магазин подтвердит возврат.
              </p>
            </div>
          </section>

          <p className="max-w-[48rem] font-lj-body text-sm leading-[1.6] opacity-70">
            Сервис рассрочки Яндекс Сплит предоставляет ООО «Финансовые и платежные технологии»
            (ОГРН 1237700813844). Подробнее —{' '}
            <a href={SPLIT_RULES_URL} className={LINK} target="_blank" rel="noopener noreferrer">
              Правила сервиса рассрочки
            </a>{' '}
            и{' '}
            <a href={SPLIT_HELP_URL} className={LINK} target="_blank" rel="noopener noreferrer">
              Справка Сплита
            </a>
            .
          </p>
        </div>
      </LabSection>
    </>
  )
}
