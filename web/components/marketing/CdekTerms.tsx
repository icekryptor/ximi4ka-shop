import { CDEK_TERMS } from '@/lib/orderProcess'

// Средние сроки доставки СДЭК по регионам. Общая для главной и /order-process.
export function CdekTerms() {
  return (
    <table
      aria-label="Средние сроки доставки СДЭК"
      className="w-full border-collapse text-left font-lj-body text-base"
    >
      <thead>
        <tr className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
          <th scope="col" className="pb-3 pr-4 font-normal">
            Регион
          </th>
          <th scope="col" className="pb-3 text-right font-normal">
            Срок
          </th>
        </tr>
      </thead>
      <tbody>
        {CDEK_TERMS.map((t) => (
          <tr key={t.region} className="border-t border-[var(--color-lj-rule)]">
            <td className="py-3 pr-4">{t.region}</td>
            <td className="whitespace-nowrap py-3 text-right font-[700]">{t.days}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
