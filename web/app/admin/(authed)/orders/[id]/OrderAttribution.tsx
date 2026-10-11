import type {
  AttributionTouch,
  OrderAttribution as OrderAttributionData,
} from '@ximi4ka-shop/shared'
import { formatDateTime } from '../orderUi'

type Row = [label: string, value: string | undefined, mono?: boolean]

function touchRows(touch: AttributionTouch): Row[] {
  return [
    ['Когда', formatDateTime(touch.at)],
    ['Страница входа', touch.landing, true],
    ['Откуда', touch.referrer ?? 'прямой заход', true],
    ['yclid', touch.yclid, true],
    ['ysclid', touch.ysclid, true],
    ['utm_source', touch.utm_source],
    ['utm_medium', touch.utm_medium],
    ['utm_campaign', touch.utm_campaign],
    ['utm_term', touch.utm_term],
    ['utm_content', touch.utm_content],
  ]
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-2 space-y-2">
      {rows
        .filter(([, value]) => value)
        .map(([label, value, mono]) => (
          <div key={label}>
            <dt className="text-xs text-brand-text-secondary">{label}</dt>
            <dd
              className={mono ? 'text-brand-text font-mono text-xs break-all' : 'text-brand-text'}
            >
              {value}
            </dd>
          </div>
        ))}
    </dl>
  )
}

// Откуда пришёл покупатель: метки из адреса и referrer (их присылает витрина,
// это подсказка для сверки рекламы, а не доказательство) и адрес с браузером,
// которые зафиксировал сервер.
export function OrderAttribution({
  attribution,
  clientIp,
  clientUserAgent,
}: {
  attribution: OrderAttributionData | null | undefined
  clientIp: string | null | undefined
  clientUserAgent: string | null | undefined
}) {
  const hasAny = Boolean(attribution?.first || attribution?.last || clientIp || clientUserAgent)

  return (
    <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
      <h2 className="text-lg font-semibold text-brand-text">Источник</h2>
      {!hasAny && <p className="mt-3 text-brand-text-secondary">Источник не определён</p>}
      {(attribution?.first || attribution?.last) && (
        <p className="mt-1 text-xs text-brand-text-secondary">
          Метки прислал браузер покупателя, они не проверены. IP и браузер зафиксировал сервер.
        </p>
      )}
      {attribution?.first && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
            Первое касание
          </h3>
          <Rows rows={touchRows(attribution.first)} />
        </div>
      )}
      {attribution?.last && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
            Последнее с метками
          </h3>
          <Rows rows={touchRows(attribution.last)} />
        </div>
      )}
      {(clientIp || clientUserAgent) && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
            При оформлении
          </h3>
          <Rows
            rows={[
              ['IP', clientIp ?? undefined, true],
              ['Браузер', clientUserAgent ?? undefined, true],
            ]}
          />
        </div>
      )}
    </section>
  )
}
