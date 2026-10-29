import { describe, it, expect } from 'vitest'
import { SERIES, seriesKey, stackLayout } from './sourcesChartLayout'

describe('stackLayout', () => {
  it('высота столбца пропорциональна сумме, сегменты в порядке SERIES снизу вверх', () => {
    const bars = stackLayout(
      [
        { weekStart: '2026-10-12', visitsBySource: { organic: 10, direct: 10 } },
        { weekStart: '2026-10-19', visitsBySource: { organic: 30, social: 10 } },
      ],
      200,
      100,
    )
    expect(bars).toHaveLength(2)
    expect(bars[1].total).toBe(40)
    expect(bars[1].segments.reduce((s, x) => s + x.height, 0)).toBeCloseTo(100)
    expect(bars[0].segments.reduce((s, x) => s + x.height, 0)).toBeCloseTo(50)
    expect(bars[1].segments.map((s) => s.key)).toEqual(['organic', 'other'])
    // нижний сегмент упирается в ось
    const bottom = bars[1].segments[0]
    expect(bottom.y + bottom.height).toBeCloseTo(100)
  })
  it('пусто и нули — без деления на ноль', () => {
    expect(stackLayout([], 200, 100)).toEqual([])
    const [bar] = stackLayout([{ weekStart: '2026-10-19', visitsBySource: {} }], 200, 100)
    expect(bar.segments).toEqual([])
  })
  it('подпись ссылок в легенде такая же, как в таблице', () => {
    expect(SERIES.find((s) => s.key === 'referral')?.label).toBe('Ссылки на сайтах')
  })
  it('seriesKey: малые источники — в «Остальное»', () => {
    expect(seriesKey('organic')).toBe('organic')
    expect(seriesKey('messenger')).toBe('other')
  })
})
