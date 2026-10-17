import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CisDelivery } from './CisDelivery'
import { useCisDelivery } from './useCisDelivery'

afterEach(cleanup)

let model: ReturnType<typeof useCisDelivery>

function Harness({ errors = {} }: { errors?: Parameters<typeof CisDelivery>[0]['errors'] }) {
  const delivery = useCisDelivery()
  // eslint-disable-next-line react-hooks/globals
  model = delivery
  return <CisDelivery delivery={delivery} errors={errors} />
}

function options(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '')
}

describe('<CisDelivery>', () => {
  it('город недоступен, пока не выбрана страна', () => {
    render(<Harness />)
    expect(screen.getByLabelText(/город/i)).toBeDisabled()
  })

  it('после страны в списке города только этой страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    const list = options(screen.getByLabelText(/город/i))
    expect(list).toContain('Алматы')
    expect(list).not.toContain('Минск')
  })

  it('смена страны сбрасывает город', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.city).toBe('Минск')
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    expect(model.city).toBe('')
    expect(screen.getByLabelText(/город/i)).toHaveValue('')
  })

  it('подсказка с ценой для выбранной страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'AM' } })
    expect(screen.getByText(/бесплатно от 5\D000\D*₽, иначе 1\D200\D*₽/i)).toBeInTheDocument()
    expect(
      screen.getByText(/нет вашего города\? доставка туда пока невозможна/i),
    ).toBeInTheDocument()
  })

  it('destination собирается только из страны, города из списка и адреса', () => {
    render(<Harness />)
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/адрес пункта/i), {
      target: { value: '  ул. Ленина, 5 ' },
    })
    expect(model.destination).toEqual({
      method: 'cdek_manual_cis',
      country: 'BY',
      city: 'Минск',
      address: 'ул. Ленина, 5',
    })
  })

  it('shippingRub: null без страны, затем цена или 0 по порогу', () => {
    render(<Harness />)
    expect(model.shippingRub(2000)).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    expect(model.shippingRub(2000)).toBe(700)
    expect(model.shippingRub(3000)).toBe(0)
  })

  it('предупреждает, что пока оплата доступна только картами «Мир» (до выбора страны)', () => {
    render(<Harness />)
    expect(screen.getByRole('note')).toHaveTextContent('Пока оплата доступна только картами «Мир».')
  })

  it('показывает ошибки полей', () => {
    render(
      <Harness
        errors={{
          country: 'Выберите страну',
          cisCity: 'Выберите город из списка',
          cisAddress: 'Укажите адрес пункта выдачи СДЭК',
        }}
      />,
    )
    expect(screen.getByText('Выберите страну')).toBeInTheDocument()
    expect(screen.getByText('Укажите адрес пункта выдачи СДЭК')).toBeInTheDocument()
  })
})
