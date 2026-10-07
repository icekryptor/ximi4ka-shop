import { BATCH_PRICING, PERCENT_TIERS, WHOLESALE_GROUPS } from '@/lib/wholesale'
import { formatRub } from '@/lib/stockLabel'

// Таблица читает ступени из того же движка, по которому считают корзина и
// сервер, — цифры на странице не могут разойтись с реальными ценами.

const KIT_NAMES: Record<string, string> = {
  'himichka-30': 'Химичка 3.0',
  elektrohimichka: 'Электрохимичка',
  'bolshoi-nabor-dlya-oge': 'Набор для ОГЭ',
  'mini-himichka': 'Мини-Химичка',
}

const TABLE = 'w-full border-collapse text-left font-lj-body text-sm'
const TH =
  'border-b border-[var(--color-lj-rule)] px-3 py-2 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70'
const TD = 'border-b border-[var(--color-lj-rule-soft)] px-3 py-3 tabular-nums'

export function WholesaleTiersTable() {
  // Наборы с одной и той же шкалой — одной строкой (считаются они по отдельности).
  const scales: { tiers: (typeof WHOLESALE_GROUPS)[number]['tiers']; names: string[] }[] = []
  for (const group of WHOLESALE_GROUPS) {
    const name = KIT_NAMES[group.slugs[0]] ?? group.slugs[0]
    const scale = scales.find((sc) => sc.tiers === group.tiers)
    if (scale) scale.names.push(name)
    else scales.push({ tiers: group.tiers, names: [name] })
  }
  const kitThresholds = [...scales[0].tiers].reverse().map((t) => t.minQty)
  const percentTiers = [...PERCENT_TIERS].reverse()
  const batchSteps = BATCH_PRICING.get('probirka')!.steps.map((s) => s.qty)

  return (
    <div className="flex flex-col gap-12">
      <table className={TABLE} aria-label="Наборы">
        <thead>
          <tr>
            <th className={TH}>Набор</th>
            {kitThresholds.map((q) => (
              <th key={q} className={TH}>
                от {q} шт
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scales.map((scale) => (
            <tr key={scale.names.join()}>
              <td className={TD}>
                {scale.names.join(', ')}
                {scale.names.length > 1 ? ' — каждый набор считается отдельно' : ''}
              </td>
              {[...scale.tiers].reverse().map((t) => (
                <td key={t.minQty} className={TD}>
                  −{formatRub(t.offRub)} с набора
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <table className={TABLE} aria-label="Реагенты и оборудование">
        <thead>
          <tr>
            <th className={TH}>Позиция</th>
            {percentTiers.map((t) => (
              <th key={t.minQty} className={TH}>
                от {t.minQty} шт
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={TD}>Каждая позиция отдельно</td>
            {percentTiers.map((t) => (
              <td key={t.minQty} className={TD}>
                −{t.percent}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div>
        <table className={TABLE} aria-label="Пробирки и пипетки">
          <thead>
            <tr>
              <th className={TH}>Товар</th>
              {batchSteps.map((q) => (
                <th key={q} className={TH}>
                  {q} шт
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Пробирки', 'probirka'],
              ['Пипетки', 'pipetka-pastera'],
            ].map(([title, slug]) => (
              <tr key={slug}>
                <td className={TD}>{title}</td>
                {BATCH_PRICING.get(slug)!.steps.map((s) => (
                  <td key={s.qty} className={TD}>
                    {formatRub(s.totalRub)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 font-lj-body text-sm opacity-70">
          Цена указана за всю партию; сверх 20 шт. каждая следующая пробирка стоит{' '}
          {formatRub(BATCH_PRICING.get('probirka')!.extraUnitRub)}, пипетка{' '}
          {formatRub(BATCH_PRICING.get('pipetka-pastera')!.extraUnitRub)}. Партионная цена действует
          при количествах 2, 5, 10, 20 и больше 20 шт.
        </p>
      </div>
    </div>
  )
}
