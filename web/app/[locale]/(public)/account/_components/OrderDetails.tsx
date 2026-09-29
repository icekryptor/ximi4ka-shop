import Link from 'next/link'
import type { AccountOrderSummary, DeliveryMethod } from '@ximi4ka-shop/shared'
import { formatRub } from '@/lib/stockLabel'

const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  cdek_pvz: 'ПВЗ СДЭК',
  cdek_courier: 'Курьер СДЭК',
}

const LINK_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2'

function TotalRow({
  label,
  children,
  strong = false,
}: {
  label: string
  children: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-[700] text-lg' : 'opacity-80'}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

// Подробности заказа внутри раскрытой строки истории: состав, суммы,
// доставка и трек. Данные приходят из AccountOrderSummary целиком —
// отдельного запроса за подробностями нет.
export function OrderDetails({ order }: Readonly<{ order: AccountOrderSummary }>) {
  const { shipment } = order
  const closed = order.status === 'cancelled' || order.status === 'failed'
  // У отменённых и неудавшихся заказов о треке не говорим вовсе.
  const trackingUrl = !closed && shipment?.state === 'created' ? shipment.trackingUrl : null

  return (
    <div className="flex flex-col gap-5 border-t border-[var(--color-lj-rule)] px-5 pb-5 pt-4">
      <ul className="flex list-none flex-col gap-3 p-0 m-0">
        {order.items.map((i, idx) => (
          <li key={`${i.name}-${idx}`} className="flex items-center gap-3">
            {i.imageUrl && (
              <div className="w-12 h-12 shrink-0 rounded-xl border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream-shade)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- 48px-миниатюра в списке заказов, как в CartDrawer: next/image здесь только добавил бы обёртку и лоадер */}
                <img
                  src={i.imageUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <span className="flex-1">
              {i.name} × {i.quantity}
            </span>
            <span className="font-[700] whitespace-nowrap">
              {formatRub(i.unitPriceRub * i.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 border-t border-[var(--color-lj-rule)] pt-3">
        <TotalRow label="Товары">{formatRub(order.subtotalRub)}</TotalRow>
        {order.discountRub > 0 && (
          <TotalRow label="Скидка">{`−${formatRub(order.discountRub)}`}</TotalRow>
        )}
        <TotalRow label="Доставка">
          {order.shippingRub === 0 ? 'бесплатно' : formatRub(order.shippingRub)}
        </TotalRow>
        <TotalRow label="Итого" strong>
          {formatRub(order.totalRub)}
        </TotalRow>
      </div>

      <p className="m-0 text-sm">
        <span className="opacity-60">{DELIVERY_LABEL[order.deliveryMethod]}: </span>
        {order.deliveryAddress}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_BUTTON_CLASS} lj-cta-bright font-lj-mono uppercase tracking-[0.08em]`}
          >
            Отследить посылку →
          </a>
        ) : (
          !closed && (
            <p className="m-0 text-sm opacity-70">
              Трек-номер появится после передачи заказа в СДЭК
            </p>
          )
        )}
        <Link
          href={`/order/${order.orderNumber}#t=${encodeURIComponent(order.publicToken)}`}
          className="text-sm text-[var(--color-brand)] underline underline-offset-4 hover:text-[var(--color-brand-dark)]"
        >
          Страница заказа
        </Link>
      </div>
    </div>
  )
}
