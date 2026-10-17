import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DeliveryCities } from './DeliveryCities'
import { CDEK_CITIES } from '@/lib/cdekCities'

describe('<DeliveryCities>', () => {
  it('выводит города по четырём странам ЕАЭС', () => {
    render(<DeliveryCities />)
    const list = screen.getByRole('list', { name: 'Города с пунктами выдачи СДЭК' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Беларусь')
    expect(items[0]).toHaveTextContent('Минск')
    expect(items[1]).toHaveTextContent('Казахстан')
    expect(items[1]).toHaveTextContent('Алматы')
    expect(items[2]).toHaveTextContent('Армения')
    expect(items[2]).toHaveTextContent('Ереван')
    expect(items[3]).toHaveTextContent('Киргизия')
    expect(items[3]).toHaveTextContent('Бишкек')
  })

  it('показывает каждый город из данных', () => {
    const { container } = render(<DeliveryCities />)
    for (const cities of Object.values(CDEK_CITIES)) {
      for (const city of cities) expect(container).toHaveTextContent(city)
    }
  })

  it('в данных нет пустых и повторяющихся названий', () => {
    for (const cities of Object.values(CDEK_CITIES)) {
      expect(cities.every((c) => c.trim() === c && c.length > 0)).toBe(true)
      expect(new Set(cities).size).toBe(cities.length)
    }
  })
})
