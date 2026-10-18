import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { EaeuOrderGuide } from './EaeuOrderGuide'

afterEach(() => cleanup())

describe('<EaeuOrderGuide>', () => {
  it('рендерит секцию с якорем и заголовком про четыре страны', () => {
    const { container } = render(<EaeuOrderGuide />)
    expect(container.querySelector('#eaeu-guide')).not.toBeNull()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Как заказать в Беларусь, Казахстан, Армению и Киргизию',
      }),
    ).toBeInTheDocument()
  })

  it('выводит пять шагов нумерованным списком', () => {
    render(<EaeuOrderGuide />)
    const steps = screen.getAllByRole('heading', { level: 3 })
    expect(steps).toHaveLength(5)
    expect(steps[3]).toHaveTextContent('Впишите адрес пункта выдачи')
  })

  it('показывает, какие карты принимаются, а какие пока нет', () => {
    render(<EaeuOrderGuide />)
    const cards = screen.getByRole('list', { name: /Какими картами/ })
    const items = within(cards).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Visa и Mastercard, выпущенные в России: принимаем')
    expect(items[1]).toHaveTextContent(
      '«Мир», выпущенные в Беларуси, Казахстане, Армении и Киргизии: принимаем',
    )
    expect(items[2]).toHaveTextContent(
      'Visa и Mastercard, выпущенные в Беларуси, Казахстане, Армении и Киргизии: пока не принимаем',
    )
  })
})
