import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { resetAccountTables, seedOrder } from '../testUtils.js'

const LINK = 'https://pay.ya.ru/l/test-link'

describe('статус заказа: ссылка «Оплатить» для Яндекс Пэй', () => {
  const app = createApp()
  const status = (number: string, t?: string) =>
    request(app)
      .get(`/api/public/orders/${number}/status`)
      .query(t ? { t } : {})

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
  })

  it('неоплаченный заказ Яндекс Пэй с верным секретом — ссылка есть', async () => {
    const order = await seedOrder({ paymentProvider: 'yandex_pay', paymentUrl: LINK })
    expect((await status(order.orderNumber, order.publicToken)).body.data.paymentUrl).toBe(LINK)
  })

  it('без секрета или с чужим — поля нет', async () => {
    const order = await seedOrder({ paymentProvider: 'yandex_pay', paymentUrl: LINK })
    expect((await status(order.orderNumber)).body.data).not.toHaveProperty('paymentUrl')
    const wrong = 'x'.repeat(order.publicToken.length)
    expect((await status(order.orderNumber, wrong)).body.data).not.toHaveProperty('paymentUrl')
  })

  it('оплаченный заказ и заказ Т-Кассы — поля нет', async () => {
    const paid = await seedOrder({
      paymentProvider: 'yandex_pay',
      paymentUrl: LINK,
      status: 'paid',
    })
    expect((await status(paid.orderNumber, paid.publicToken)).body.data).not.toHaveProperty(
      'paymentUrl',
    )
    const tbank = await seedOrder({
      paymentProvider: 'tbank',
      paymentUrl: 'https://securepay.tinkoff.ru/x',
    })
    expect((await status(tbank.orderNumber, tbank.publicToken)).body.data).not.toHaveProperty(
      'paymentUrl',
    )
  })
})
