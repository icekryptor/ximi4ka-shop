import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OrderProcessSection } from './OrderProcessSection'

describe('<OrderProcessSection>', () => {
  it('выводит заголовок секции и четыре шага по порядку', () => {
    render(<OrderProcessSection href="/order-process" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Заказ и доставка' })).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Шаги заказа' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(steps[0]).toHaveTextContent('01')
    expect(steps[0]).toHaveTextContent('Соберите корзину, оформите заказ и оплатите')
    expect(steps[2]).toHaveTextContent('Отправляем в течение суток')
    expect(steps[3]).toHaveTextContent('Средние сроки доставки СДЭК')
  })

  it('содержит условия по странам и таблицу сроков СДЭК', () => {
    render(<OrderProcessSection href="/order-process" />)
    expect(
      screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })).toBeInTheDocument()
  })

  it('ведёт на подробную страницу по переданному href', () => {
    render(<OrderProcessSection href="/en/order-process" />)
    expect(screen.getByRole('link', { name: 'Подробнее о заказе и доставке' })).toHaveAttribute(
      'href',
      '/en/order-process',
    )
  })

  it('имеет якорь #order-process', () => {
    const { container } = render(<OrderProcessSection href="/order-process" />)
    expect(container.querySelector('section#order-process')).not.toBeNull()
  })
})
