import { describe, it, expect } from 'vitest'
import { barLayout } from './chartScale'

const day = (date: string, revenueRub: number, orders = 0) => ({ date, revenueRub, orders })

describe('barLayout', () => {
  it('высота пропорциональна выручке, максимум занимает всю высоту', () => {
    const bars = barLayout(
      [day('2026-10-05', 0), day('2026-10-06', 500), day('2026-10-07', 1000)],
      300,
      100,
    )
    expect(bars.map((b) => b.height)).toEqual([0, 50, 100])
    expect(bars.map((b) => b.y)).toEqual([100, 50, 0])
  })

  it('столбцы идут слева направо и помещаются в ширину', () => {
    const bars = barLayout([day('a', 1), day('b', 1), day('c', 1)], 300, 100)
    expect(bars[0].x).toBeLessThan(bars[1].x)
    expect(bars[1].x).toBeLessThan(bars[2].x)
    const last = bars[2]
    expect(last.x + last.width).toBeLessThanOrEqual(300)
    expect(bars[0].x).toBeGreaterThanOrEqual(0)
  })

  it('данные дня переносятся в столбец для подсказки', () => {
    const [bar] = barLayout([day('2026-10-05', 1200, 3)], 100, 50)
    expect(bar).toMatchObject({ date: '2026-10-05', revenueRub: 1200, orders: 3 })
  })

  it('нулевой максимум: все высоты 0, без NaN', () => {
    const bars = barLayout([day('a', 0), day('b', 0)], 100, 50)
    expect(bars.every((b) => b.height === 0 && Number.isFinite(b.y))).toBe(true)
  })

  it('маленькая ненулевая выручка остаётся видимой (минимум 2)', () => {
    const bars = barLayout([day('a', 1), day('b', 1_000_000)], 100, 100)
    expect(bars[0].height).toBeGreaterThanOrEqual(2)
  })

  it('пустой ряд — пустой результат', () => {
    expect(barLayout([], 100, 50)).toEqual([])
  })

  it('один день занимает почти всю ширину', () => {
    const [bar] = barLayout([day('a', 10)], 100, 50)
    expect(bar.width).toBeGreaterThan(80)
    expect(bar.x + bar.width).toBeLessThanOrEqual(100)
  })

  it('366 дней: ширина столбца не меньше 1 и никто не вылезает за край', () => {
    const days = Array.from({ length: 366 }, (_, i) => day(String(i), i + 1))
    const bars = barLayout(days, 640, 100)
    expect(bars).toHaveLength(366)
    expect(bars.every((b) => b.width >= 1 && b.x >= 0 && b.x + b.width <= 640.001)).toBe(true)
  })
})
