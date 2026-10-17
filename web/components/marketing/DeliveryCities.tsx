import {
  CIS_CITIES,
  CIS_COUNTRIES,
  CIS_COUNTRY_NAMES,
  CIS_FLAG_CODES,
} from '@ximi4ka-shop/shared/types/cis'
import { Flag } from './Flag'

// Города стран ЕАЭС, где есть пункты выдачи или постаматы СДЭК. Для /order-process.
export function DeliveryCities() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-lj-display text-xl font-[700] tracking-[-0.02em]">
        Города с пунктами выдачи СДЭК
      </h3>
      <ul aria-label="Города с пунктами выдачи СДЭК" className="m-0 flex list-none flex-col p-0">
        {CIS_COUNTRIES.map((code) => (
          <li
            key={code}
            className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] py-4 first:border-t-0 first:pt-0"
          >
            <span className="flex items-center gap-2 font-lj-body text-base font-[600]">
              <Flag code={CIS_FLAG_CODES[code]} />
              {CIS_COUNTRY_NAMES[code]}
            </span>
            <span className="font-lj-body text-[0.9375rem] leading-[1.6] opacity-80">
              {CIS_CITIES[code].join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
