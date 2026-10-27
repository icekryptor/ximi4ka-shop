import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CisPaymentMethodField } from './CisPaymentMethodField'

afterEach(cleanup)

describe('CisPaymentMethodField', () => {
  it('два способа; при 8% — надбавка в подписи; выбор уходит в onChange', () => {
    const onChange = vi.fn()
    render(<CisPaymentMethodField value="tbank" onChange={onChange} surchargePercent={8} />)
    expect(screen.getByLabelText('Картой «Мир» или российской Visa / Mastercard')).toBeChecked()
    const foreign = screen.getByLabelText(
      'Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии — +8% к заказу',
    )
    fireEvent.click(foreign)
    expect(onChange).toHaveBeenCalledWith('cloudpayments')
  })

  it('при 0% — без упоминания надбавки, без UnionPay', () => {
    render(<CisPaymentMethodField value="cloudpayments" onChange={() => {}} surchargePercent={0} />)
    expect(
      screen.getByLabelText('Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии'),
    ).toBeChecked()
    expect(document.body.textContent).not.toMatch(/%|UnionPay/)
  })
})
