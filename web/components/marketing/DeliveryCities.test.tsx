import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DeliveryCities } from './DeliveryCities'
import { CIS_CITIES } from '@ximi4ka-shop/shared/types/cis'

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

  it('заголовок называет страны и склоняется правильно', () => {
    render(<DeliveryCities />)
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Города с пунктами выдачи СДЭК в Беларуси, Казахстане, Армении и Киргизии',
      }),
    ).toBeInTheDocument()
  })

  it('показывает каждый город из данных', () => {
    const { container } = render(<DeliveryCities />)
    for (const cities of Object.values(CIS_CITIES)) {
      for (const city of cities) expect(container).toHaveTextContent(city)
    }
  })

  it('в данных нет пустых и повторяющихся названий', () => {
    for (const cities of Object.values(CIS_CITIES)) {
      expect(cities.every((c) => c.trim() === c && c.length > 0)).toBe(true)
      expect(new Set(cities).size).toBe(cities.length)
    }
  })
})
