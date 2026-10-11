import type { StatsDay } from '@ximi4ka-shop/shared'

// Геометрия столбчатого графика выручки: чистая функция, отдельно от SVG,
// чтобы масштаб (нулевой максимум, 366 дней, крошечные значения) тестировался.
export interface Bar {
  x: number
  y: number
  width: number
  height: number
  date: string
  revenueRub: number
  orders: number
}

const MIN_VISIBLE_HEIGHT = 2

export function barLayout(days: StatsDay[], width: number, height: number): Bar[] {
  if (days.length === 0) return []
  const max = Math.max(...days.map((d) => d.revenueRub))
  const slot = width / days.length
  // Зазор не больше четверти слота: на длинных периодах столбцы тоньше, но не исчезают.
  const gap = Math.min(4, slot * 0.25)
  const barWidth = Math.max(1, slot - gap)
  return days.map((d, i) => {
    const raw = max > 0 ? (d.revenueRub / max) * height : 0
    const h = d.revenueRub > 0 ? Math.max(MIN_VISIBLE_HEIGHT, raw) : 0
    return {
      x: i * slot + (slot - barWidth) / 2,
      y: height - h,
      width: barWidth,
      height: h,
      date: d.date,
      revenueRub: d.revenueRub,
      orders: d.orders,
    }
  })
}
