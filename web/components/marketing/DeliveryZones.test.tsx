import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DeliveryZones } from './DeliveryZones'

describe('<DeliveryZones>', () => {
  it('выводит список из четырёх зон с условиями', () => {
    render(<DeliveryZones />)
    const list = screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Россия')
    expect(items[0]).toHaveTextContent(/до пункта выдачи, курьером — от 5\D000\D*₽/u)
    expect(items[1]).toHaveTextContent('Беларусь')
    expect(items[2]).toHaveTextContent('Казахстан, Армения, Киргизия')
    expect(items[3]).toHaveTextContent('Узбекистан, Азербайджан, Таджикистан')
    expect(items[3]).toHaveTextContent('Доставка оплачивается отдельно')
  })

  it('показывает восемь декоративных флагов и не упоминает Молдову', () => {
    const { container } = render(<DeliveryZones />)
    const flags = container.querySelectorAll('img[src^="/img/flags/"]')
    expect(flags).toHaveLength(8)
    flags.forEach((f) => expect(f).toHaveAttribute('alt', ''))
    expect(container).not.toHaveTextContent('Молдов')
  })
})
