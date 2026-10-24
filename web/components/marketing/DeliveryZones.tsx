import { buildDeliveryZones } from '@/lib/orderProcess'
import { Flag } from './Flag'

// Условия бесплатной доставки по странам: флаги, названия, порог.
// Общий для блока на главной и страницы /order-process.
export function DeliveryZones() {
  const zones = buildDeliveryZones()
  return (
    <ul
      aria-label="Условия бесплатной доставки по странам"
      className="m-0 flex list-none flex-col p-0"
    >
      {zones.map((zone) => (
        <li
          key={zone.id}
          className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2 font-lj-body text-base">
            <span className="flex items-center gap-2">
              {zone.countries.map((c) => (
                <Flag key={c.code} code={c.code} />
              ))}
            </span>
            <span className="font-[600]">{zone.countries.map((c) => c.name).join(', ')}</span>
          </span>
          <span className="font-lj-body text-[0.9375rem] opacity-80 sm:max-w-[20rem] sm:text-right">
            {zone.condition}
          </span>
        </li>
      ))}
    </ul>
  )
}
