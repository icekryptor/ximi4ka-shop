import { CDEK_CITIES, type CdekCityCountry } from '@/lib/cdekCities'
import { Flag } from './Flag'

const COUNTRIES: { code: CdekCityCountry; name: string }[] = [
  { code: 'by', name: 'Беларусь' },
  { code: 'kz', name: 'Казахстан' },
  { code: 'am', name: 'Армения' },
  { code: 'kg', name: 'Киргизия' },
]

// Города стран ЕАЭС, где есть пункты выдачи или постаматы СДЭК. Для /order-process.
export function DeliveryCities() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-lj-display text-xl font-[700] tracking-[-0.02em]">
        Города с пунктами выдачи СДЭК
      </h3>
      <ul aria-label="Города с пунктами выдачи СДЭК" className="m-0 flex list-none flex-col p-0">
        {COUNTRIES.map((c) => (
          <li
            key={c.code}
            className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] py-4 first:border-t-0 first:pt-0"
          >
            <span className="flex items-center gap-2 font-lj-body text-base font-[600]">
              <Flag code={c.code} />
              {c.name}
            </span>
            <span className="font-lj-body text-[0.9375rem] leading-[1.6] opacity-80">
              {CDEK_CITIES[c.code].join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
