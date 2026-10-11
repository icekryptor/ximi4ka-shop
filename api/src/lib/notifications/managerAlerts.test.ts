import { describe, it, expect } from 'vitest'
import { channelsForEvent, isManagerAlert } from './outbox.js'
import { managerAlertText } from './format.js'

const order = {
  orderNumber: 'XM-2026-00042',
  customerName: 'Иван <script>',
  customerPhone: '+79991234567',
  totalRub: 1850,
  externalOrderId: 'ya-order-1',
}

describe('сигналы менеджеру по заказам из Яндекса', () => {
  it('уходят только в Telegram', () => {
    expect(channelsForEvent('ycp:on_delivery')).toEqual(['telegram'])
    expect(channelsForEvent('ycp:cancel_after_ship')).toEqual(['telegram'])
    expect(isManagerAlert('ycp:on_delivery')).toBe(true)
    expect(isManagerAlert('status:paid')).toBe(false)
    expect(channelsForEvent('status:paid')).toEqual(['sheets', 'telegram'])
  })

  it('оплата при получении: что случилось и что делать', () => {
    const text = managerAlertText(order, 'ycp:on_delivery')
    expect(text).toContain('XM-2026-00042')
    expect(text).toContain('оплатой при получении')
    expect(text).toContain('ya-order-1')
    expect(text).toContain('Иван &lt;script&gt;')
  })

  it('отмена оплаченного заказа: не отгружать, отменить СДЭК вручную, проверить возврат', () => {
    const text = managerAlertText({ ...order, externalOrderId: null }, 'ycp:cancel_after_ship')
    expect(text).toContain('Яндекс отменил оплаченный заказ')
    expect(text).toContain('Не отгружайте его')
    expect(text).toContain('отмените её в СДЭК вручную')
    expect(text).toContain('возврат')
    expect(text).not.toContain('Заказ в Яндексе')
  })
})
