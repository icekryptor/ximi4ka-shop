import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LabSection } from '@/components/ui/LabSection'
import { getPublicSettings } from '@/lib/api'
import { isLocale } from '@/lib/i18n'
import { buildMetadata } from '@/lib/metadata'

// Страница зависит от настройки программы из api: включил или выключил в админке —
// должно подхватиться. Как и на главной, generateStaticParams по локалям не нужен:
// образ собирается без доступа к api, пререндер запёк бы 404 (или падение сборки)
// до конца окна revalidate. Рендер по первому запросу, дальше ISR-кеш на 60 секунд.
// Ошибку запроса настроек не превращаем в notFound(): упавший рендер не кешируется,
// а 404 — только когда api ответил, что программа выключена.
export const revalidate = 60

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const meta = await buildMetadata({
    title: 'Химикоины — правила программы — Химичка',
    metaDescription:
      'Как получить химикоины: кэшбек за заказы, когда он начисляется, сколько хранится и что будет при отмене заказа.',
    pathname: '/himikoiny',
    type: 'website',
    locale: rawLocale,
  })
  // До утверждения текста владельцем страница не продвигается.
  return { ...meta, robots: { index: false, follow: false } }
}

export default async function HimikoinyPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()

  const settings = await getPublicSettings()
  const coins = settings.coins ?? null
  if (!coins) notFound()
  const percent = coins.cashbackPercent

  const sections: { title: string; text: string }[] = [
    { title: 'Что это', text: 'Химикоины — бонусы магазина. 1 химикоин = 1 ₽.' },
    {
      title: 'Как получить',
      text: `Кэшбек ${percent}% от суммы товаров в заказе после скидок и промокода, без доставки. Нужен аккаунт: гостевой заказ засчитается, если войти с той же почтой.`,
    },
    {
      title: 'Когда начисляются',
      text: 'Когда заказ получен. До этого химикоины видны в кабинете как «ожидает начисления».',
    },
    { title: 'Срок', text: 'Химикоины не сгорают.' },
    { title: 'Если заказ отменён', text: 'Начисление за отменённый заказ отзывается.' },
    {
      title: 'Оплата химикоинами',
      text: 'Оплата химикоинами появится скоро: в магазине до 50% заказа, на learn.ximi4ka.ru — курсы и подписка.',
    },
  ]

  return (
    <LabSection variant="cream" className="px-6 pt-12 pb-24">
      <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-10">
        <header className="flex max-w-[48rem] flex-col gap-4">
          <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
            Химикоины
          </h1>
          <p className="font-lj-body text-lg opacity-80">Правила программы кэшбека.</p>
        </header>

        {sections.map((s, i) => (
          <section key={s.title} aria-labelledby={`rule-${i}`} className="flex flex-col gap-3">
            <h2 id={`rule-${i}`} className="font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              {s.title}
            </h2>
            <p className="m-0 max-w-[48rem] font-lj-body text-base leading-[1.6]">{s.text}</p>
          </section>
        ))}

        <p>
          <Link
            href="/account"
            className="inline-flex rounded-full bg-[var(--color-lj-ink)] px-6 py-3 font-lj-body text-base font-[600] text-[var(--color-lj-bone)]"
          >
            Открыть личный кабинет
          </Link>
        </p>
      </div>
    </LabSection>
  )
}
