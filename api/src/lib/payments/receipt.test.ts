import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Order } from '../../entities/Order.js'
import type { OrderItem } from '../../entities/OrderItem.js'
import { buildReceipt, parseReceiptConfig, type ReceiptConfig } from './receipt.js'

const CFG: ReceiptConfig = { taxation: 'usn_income', tax: 'none' }

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    quantity: 2,
    unitPriceRub: 1500,
    lineTotalRub: 3000,
    productSnapshot: { name: 'Набор «Химичка»', sku: null, priceRub: 1500 },
    ...overrides,
  } as OrderItem
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    orderNumber: 'XM-2026-00001',
    totalRub: 3450,
    shippingRub: 450,
    customerPhone: '+79001234567',
    customerEmail: 'buyer@example.com',
    items: [item()],
    ...overrides,
  } as Order
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildReceipt', () => {
  it('builds items in kopecks, adds delivery as a service, and sums to the order total', () => {
    const receipt = buildReceipt(order(), CFG)
    expect(receipt).toEqual({
      Email: 'buyer@example.com',
      Taxation: 'usn_income',
      Items: [
        {
          Name: 'Набор «Химичка»',
          Price: 150000,
          Quantity: 2,
          Amount: 300000,
          Tax: 'none',
          PaymentMethod: 'full_payment',
          PaymentObject: 'commodity',
        },
        {
          Name: 'Доставка',
          Price: 45000,
          Quantity: 1,
          Amount: 45000,
          Tax: 'none',
          PaymentMethod: 'full_payment',
          PaymentObject: 'service',
        },
      ],
    })
    expect(receipt.Items.reduce((sum, i) => sum + i.Amount, 0)).toBe(3450 * 100)
  })

  it('leaves the free gift line out of the receipt and still sums to the order total', () => {
    const gift = item({
      isGift: true,
      quantity: 1,
      unitPriceRub: 0,
      lineTotalRub: 0,
      productSnapshot: { name: 'Йодат калия', sku: 'KIO3', priceRub: 249 },
    })
    const receipt = buildReceipt(order({ items: [item(), gift] }), CFG)
    expect(receipt.Items.map((i) => i.Name)).toEqual(['Набор «Химичка»', 'Доставка'])
    expect(receipt.Items.reduce((sum, i) => sum + i.Amount, 0)).toBe(3450 * 100)
  })

  it('uses the configured taxation and VAT rate', () => {
    const receipt = buildReceipt(order(), { taxation: 'osn', tax: 'vat22' })
    expect(receipt.Taxation).toBe('osn')
    expect(receipt.Items.every((i) => i.Tax === 'vat22')).toBe(true)
  })

  it('omits delivery when it is free', () => {
    const receipt = buildReceipt(order({ shippingRub: 0, totalRub: 3000 }), CFG)
    expect(receipt.Items.map((i) => i.Name)).toEqual(['Набор «Химичка»'])
  })

  it('splits a line that does not divide evenly into two, keeping the quantity and the sum', () => {
    const receipt = buildReceipt(
      order({
        shippingRub: 0,
        totalRub: 1001,
        items: [item({ quantity: 3, unitPriceRub: 334, lineTotalRub: 1001 })],
      }),
      CFG,
    )
    expect(receipt.Items).toHaveLength(2)
    const [head, rest] = receipt.Items
    expect(head).toMatchObject({ Price: 33366, Quantity: 2, Amount: 66732 })
    expect(rest).toMatchObject({ Price: 33368, Quantity: 1, Amount: 33368 })
    expect(head.Quantity + rest.Quantity).toBe(3)
    for (const line of receipt.Items) expect(line.Price * line.Quantity).toBe(line.Amount)
    expect(head.Amount + rest.Amount).toBe(100100)
  })

  it('falls back to unit price × quantity for orders without a line total', () => {
    const receipt = buildReceipt(
      order({
        shippingRub: 0,
        totalRub: 3000,
        items: [item({ lineTotalRub: null })],
      }),
      CFG,
    )
    expect(receipt.Items[0]).toMatchObject({ Price: 150000, Quantity: 2, Amount: 300000 })
  })

  it('cuts long product names to 128 characters without splitting an emoji', () => {
    const plain = buildReceipt(
      order({
        shippingRub: 0,
        totalRub: 3000,
        items: [item({ productSnapshot: { name: 'я'.repeat(200), sku: null, priceRub: 1500 } })],
      }),
      CFG,
    )
    expect(plain.Items[0].Name).toHaveLength(128)

    const emoji = buildReceipt(
      order({
        shippingRub: 0,
        totalRub: 3000,
        items: [
          item({ productSnapshot: { name: `${'я'.repeat(127)}🧪🧪`, sku: null, priceRub: 1 } }),
        ],
      }),
      CFG,
    )
    expect(Array.from(emoji.Items[0].Name)).toHaveLength(128)
    expect(emoji.Items[0].Name.endsWith('🧪')).toBe(true)
    expect(emoji.Items[0].Name).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })

  it('uses the phone, normalised to +7XXXXXXXXXX, when there is no email', () => {
    for (const raw of ['8 (900) 123-45-67', '+7 900 123 45 67', '9001234567', '79001234567']) {
      const receipt = buildReceipt(order({ customerEmail: '', customerPhone: raw }), CFG)
      expect(receipt.Phone).toBe('+79001234567')
      expect(receipt.Email).toBeUndefined()
    }
  })

  it('refuses a phone that is not a single Russian number', () => {
    for (const raw of [
      '8 900 123-45-67, доб. 12',
      '+7 900 123-45-67 / +7 911 222-33-44',
      '+1 202 555 0100',
    ]) {
      expect(() => buildReceipt(order({ customerEmail: '', customerPhone: raw }), CFG)).toThrow(
        /contact/i,
      )
    }
  })

  it('uses the phone when the email is longer than the bank allows (64)', () => {
    const longEmail = `${'a'.repeat(60)}@example.com`
    const receipt = buildReceipt(order({ customerEmail: longEmail }), CFG)
    expect(receipt.Email).toBeUndefined()
    expect(receipt.Phone).toBe('+79001234567')
    expect(
      buildReceipt(order({ customerEmail: `${'a'.repeat(52)}@example.com` }), CFG).Email,
    ).toHaveLength(64)
  })

  it('throws when there is no email and the phone is unusable', () => {
    expect(() => buildReceipt(order({ customerEmail: '', customerPhone: '12-34' }), CFG)).toThrow(
      /contact/i,
    )
  })

  it('throws when the lines do not add up to the order total', () => {
    expect(() => buildReceipt(order({ totalRub: 9999 }), CFG)).toThrow(/sum/i)
  })

  it('throws when the order has no items loaded', () => {
    expect(() => buildReceipt(order({ items: undefined }), CFG)).toThrow(/items/i)
    expect(() => buildReceipt(order({ items: [] }), CFG)).toThrow(/items/i)
  })
})

describe('parseReceiptConfig', () => {
  it('defaults to USN income and no VAT', () => {
    expect(parseReceiptConfig({})).toEqual({ taxation: 'usn_income', tax: 'none' })
  })

  it('knows the calculated VAT rates too', () => {
    expect(parseReceiptConfig({ TBANK_RECEIPT_TAX: 'vat105' } as NodeJS.ProcessEnv).tax).toBe(
      'vat105',
    )
  })

  it('reads TBANK_TAXATION and TBANK_RECEIPT_TAX', () => {
    expect(
      parseReceiptConfig({
        TBANK_TAXATION: 'osn',
        TBANK_RECEIPT_TAX: 'vat22',
      } as NodeJS.ProcessEnv),
    ).toEqual({ taxation: 'osn', tax: 'vat22' })
  })

  it('accepts any letter case', () => {
    expect(
      parseReceiptConfig({
        TBANK_TAXATION: ' OSN ',
        TBANK_RECEIPT_TAX: 'VAT22',
      } as NodeJS.ProcessEnv),
    ).toEqual({ taxation: 'osn', tax: 'vat22' })
  })

  it('refuses an unknown value instead of filing a receipt under the default', () => {
    expect(() => parseReceiptConfig({ TBANK_TAXATION: 'usn' } as NodeJS.ProcessEnv)).toThrow(
      /TBANK_TAXATION/,
    )
    expect(() => parseReceiptConfig({ TBANK_RECEIPT_TAX: '20%' } as NodeJS.ProcessEnv)).toThrow(
      /TBANK_RECEIPT_TAX/,
    )
  })
})
