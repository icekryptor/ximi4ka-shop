import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WbPriceCompare } from './WbPriceCompare'

const NOW = new Date('2026-11-14T12:00:00+03:00')
const prices = {
  'himichka-30': { priceRub: 3790, asOf: '2026-11-14' },
  'all-4-kits': { priceRub: 13206, asOf: '2026-11-14', sumOfParts: true },
}

describe('WbPriceCompare', () => {
  afterEach(cleanup)

  it('показывает зачёркнутую цену WB и выгоду у нас', () => {
    render(<WbPriceCompare slug="himichka-30" priceRub={2949} now={NOW} prices={prices} />)
    const line = screen.getByTestId('wb-price-compare')
    expect(line).toHaveTextContent('на Wildberries')
    expect(line.querySelector('s')).toHaveTextContent(/3\s790/)
    expect(line).toHaveTextContent(/у нас дешевле на 841\s₽ \(−22%\)/)
    expect(line).toHaveAttribute('title', expect.stringContaining('14.11.2026'))
    expect(line).toHaveAttribute('title', expect.stringContaining('СПП'))
  })

  it('у комбо честно пишет, что это наборы по отдельности', () => {
    render(<WbPriceCompare slug="all-4-kits" priceRub={8888} now={NOW} prices={prices} />)
    const line = screen.getByTestId('wb-price-compare')
    expect(line).toHaveTextContent('на Wildberries по отдельности')
    expect(line).toHaveTextContent(/у нас дешевле на 4\s318\s₽ \(−32%\)/)
    expect(line).toHaveAttribute('title', expect.stringContaining('по отдельности'))
  })

  it('у набора — без «по отдельности»', () => {
    render(<WbPriceCompare slug="himichka-30" priceRub={2949} now={NOW} prices={prices} />)
    expect(screen.getByTestId('wb-price-compare')).not.toHaveTextContent('по отдельности')
  })

  it('без цены WB ничего не рисует', () => {
    const { container } = render(
      <WbPriceCompare slug="elektrohimichka" priceRub={2949} now={NOW} prices={prices} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('если у нас не дешевле — ничего не рисует', () => {
    const { container } = render(
      <WbPriceCompare slug="himichka-30" priceRub={3990} now={NOW} prices={prices} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
