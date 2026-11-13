import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeliveryProblemBadge } from './DeliveryProblemBadge'

describe('<DeliveryProblemBadge>', () => {
  it.each([
    ['cdek_not_delivered', 'СДЭК: посылка не вручена'],
    ['cdek_tracking_timeout', 'СДЭК: 60 дней без вручения'],
    ['cdek_partial_delivery', 'СДЭК: частичное вручение — решите вручную'],
  ])('%s — предупреждение с подписью', (problem, label) => {
    render(<DeliveryProblemBadge problem={problem} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('без проблемы ничего не рисует', () => {
    const { container } = render(<DeliveryProblemBadge problem={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
