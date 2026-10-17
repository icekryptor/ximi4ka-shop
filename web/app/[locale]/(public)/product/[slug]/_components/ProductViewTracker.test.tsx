import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { setMetrikaCounterId } from '@/lib/metrika'
import { ProductViewTracker } from './ProductViewTracker'

type W = Window & { dataLayer?: unknown[] }
const w = window as W

// Пакеты ecommerce без служебных { ecommerce: null } — сброса перед каждым событием.
function packages(): unknown[] {
  return (w.dataLayer ?? []).filter((e) => (e as { ecommerce: unknown }).ecommerce !== null)
}
const product = { id: 'p1', name: 'Набор «Кристаллы»', priceRub: 1500 }

beforeEach(() => {
  w.dataLayer = []
})
afterEach(() => {
  setMetrikaCounterId(null)
  delete w.dataLayer
})

describe('<ProductViewTracker>', () => {
  it('шлёт ecommerce detail при показе карточки', () => {
    setMetrikaCounterId('777')
    render(<ProductViewTracker product={product} />)
    expect(packages()).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          detail: { products: [{ id: 'p1', name: 'Набор «Кристаллы»', price: 1500 }] },
        },
      },
    ])
  })

  it('без счётчика ничего не шлёт и ничего не рисует', () => {
    const { container } = render(<ProductViewTracker product={product} />)
    expect(packages()).toEqual([])
    expect(container).toBeEmptyDOMElement()
  })
})
