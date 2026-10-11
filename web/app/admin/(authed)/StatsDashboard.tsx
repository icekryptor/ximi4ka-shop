import Link from 'next/link'
import type { StatsResponse, StatsTotals } from '@ximi4ka-shop/shared'
import type { PeriodPreset, StatsPeriod } from './statsPeriod'
import { RevenueChart } from './RevenueChart'
import { formatRub } from './orders/orderUi'

interface CardDef {
  key: keyof StatsTotals
  label: string
  hint: string
  format?: (value: number) => string
}

const CARDS: CardDef[] = [
  {
    key: 'revenueRub',
    label: 'Сумма заказов',
    hint: 'оплаченные и отправленные, по дате оплаты',
    format: formatRub,
  },
  { key: 'orders', label: 'Заказы', hint: 'созданные за период, любой статус' },
  {
    key: 'carts',
    label: 'Корзины',
    hint: 'уникальные посетители, добавившие товар; считаются с момента запуска сбора событий',
  },
  {
    key: 'clicks',
    label: 'Клики',
    hint: 'в корзину, открытие корзины, оформление, заявки на материалы; считаются с момента запуска сбора событий',
  },
  {
    key: 'logins',
    label: 'Входы в ЛК',
    hint: 'новые сессии, без учёта входа по действующей сессии',
  },
  { key: 'newUsers', label: 'Новые пользователи', hint: 'зарегистрированные аккаунты кабинета' },
]

const PRESETS: Array<{ value: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
]

const CHIP_ACTIVE = 'px-3 py-1.5 rounded-full bg-brand text-white text-sm font-semibold'
const CHIP_IDLE =
  'px-3 py-1.5 rounded-full bg-white border border-brand-border text-sm text-brand-text-secondary hover:bg-brand-bg-soft'

function isEmpty(stats: StatsResponse): boolean {
  const t = stats.totals
  return (
    t.clicks + t.carts + t.orders + t.revenueRub + t.logins + t.newUsers === 0 &&
    stats.days.every((d) => d.orders === 0 && d.revenueRub === 0)
  )
}

export function StatsDashboard({ stats, period }: { stats: StatsResponse; period: StatsPeriod }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-text">Статистика</h1>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => {
          const active = period.preset === p.value
          return (
            <Link
              key={p.value}
              href={`/admin?preset=${p.value}`}
              aria-current={active ? 'page' : undefined}
              className={active ? CHIP_ACTIVE : CHIP_IDLE}
            >
              {p.label}
            </Link>
          )
        })}
        {/* key: при клиентской навигации (плашки) страница не перемонтируется, а defaultValue
            после монтирования не применяется — перемонтируем форму при смене периода. */}
        <form
          key={`${period.from}_${period.to}`}
          method="get"
          action="/admin"
          className="flex flex-wrap items-end gap-2 ml-2"
        >
          <input type="hidden" name="preset" value="custom" />
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">С</span>
            <input
              type="date"
              name="from"
              defaultValue={period.from}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">По</span>
            <input
              type="date"
              name="to"
              defaultValue={period.to}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <button type="submit" className={period.preset === 'custom' ? CHIP_ACTIVE : CHIP_IDLE}>
            Показать
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div key={c.key} className="bg-white rounded-2xl border border-brand-border p-5">
            <div className="text-sm text-brand-text-secondary">{c.label}</div>
            <div className="mt-1 text-3xl font-bold text-brand-text">
              {(c.format ?? String)(stats.totals[c.key])}
            </div>
            <div className="mt-1 text-xs text-brand-text-secondary">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-brand-border p-5">
        <div className="mb-3 text-sm font-medium text-brand-text">
          Сумма оплаченных заказов по дням
        </div>
        <RevenueChart days={stats.days} />
        {isEmpty(stats) ? (
          <p className="mt-3 text-sm text-brand-text-secondary">Данных за этот период нет.</p>
        ) : (
          stats.days.every((d) => d.revenueRub === 0) && (
            <p className="mt-3 text-sm text-brand-text-secondary">
              Оплаченных заказов за период нет.
            </p>
          )
        )}
      </div>
    </div>
  )
}
