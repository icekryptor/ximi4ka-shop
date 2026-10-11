import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import {
  applyYcpTestEnv,
  makePickupEntry,
  seedCategory,
  seedYcpProduct,
  ycpAuth,
  ycpCheckoutBody,
} from './testHelpers.js'

const URL = '/api/v1/checkout'

describe('POST /api/v1/checkout', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories, customers RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setPickupPointsForTests(null)
  })

  async function orders(): Promise<Order[]> {
    return AppDataSource.getRepository(Order).find({ relations: { items: true } })
  }

  it('создаёт заказ из Яндекса до ПВЗ: цены Яндекса, доставка из delivery.price, событие created', async () => {
    const reagent = await seedYcpProduct({ slug: 'sernaya-kislota', priceRub: 119, sku: 'H2SO4' })
    await seedCategory('reagents', [reagent])
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: reagent.id, quantity: 5, regular_price: 119, final_price: 101 }]),
      )
    expect(res.status).toBe(201)
    expect(res.body.order_number).toMatch(/^XM-\d{4}-\d{5}$/)

    const [order] = await orders()
    expect(order).toMatchObject({
      orderNumber: res.body.order_number,
      status: 'pending',
      source: 'ycp',
      paymentProvider: 'ycp',
      externalSessionId: 'sess-0001',
      externalOrderId: null,
      customerName: 'Иван Иванов',
      customerPhone: '+79991234567',
      customerEmail: 'ivan@example.com',
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 595,
      discountRub: 90,
      shippingRub: 350,
      totalRub: 855,
    })
    expect(order.deliveryAddress).toMatchObject({
      address: 'Москва, ул. Тестовая, 1',
      deliveryPointCode: 'MSK1',
      cityCode: 44,
      quote: null,
    })
    expect(order.deliveryAddress.packages).toHaveLength(1)
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      productId: reagent.id,
      quantity: 5,
      unitPriceRub: 101,
      lineTotalRub: 505,
      isGift: false,
      productSnapshot: { name: 'Набор юного химика', sku: 'H2SO4', priceRub: 119 },
    })
    const events = await AppDataSource.getRepository(OrderNotification).findBy({
      orderId: order.id,
    })
    expect(events.map((e) => [e.channel, e.eventKey])).toEqual([['sheets', 'created']])
  })

  it('подарок к заказам из Яндекса не добавляется даже от 3000 ₽', async () => {
    const kit = await seedYcpProduct({ priceRub: 3500 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: kit.id, quantity: 1, regular_price: 3500, final_price: 3500 }]))
    expect(res.status).toBe(201)
    const [order] = await orders()
    expect(order.items).toHaveLength(1)
    expect(order.items.every((i) => !i.isGift)).toBe(true)
  })

  it('курьер: адрес с квартирой, детали подъезда в комментарий, город из id варианта', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }], {
          delivery: {
            delivery_method: 'courier',
            service_type: 'merchant_ship',
            price: 650,
            address: {
              locality: 'Новосибирск',
              address: 'ул. Ленина, 1',
              apartment: '10',
              entrance: '2',
              floor: '3',
              intercom: '12',
            },
            delivery_date_interval: {
              start_interval: { date: '2026-10-15' },
              end_interval: { date: '2026-10-17' },
            },
            ycp_delivery_option_id: 'courier-137-270',
            delivery_notes: 'позвонить заранее',
          },
        }),
      )
    expect(res.status).toBe(201)
    const [order] = await orders()
    expect(order.deliveryMethod).toBe('cdek_courier')
    expect(order.shippingRub).toBe(650)
    expect(order.deliveryAddress).toMatchObject({
      address: 'Новосибирск, ул. Ленина, 1, кв. 10',
      comment: 'позвонить заранее; подъезд 2; этаж 3; домофон 12',
      cityCode: 270,
      deliveryPointCode: null,
    })
  })

  it('связывает заказ с покупателем по подтверждённому email без учёта регистра', async () => {
    const customer = await AppDataSource.getRepository(Customer).save(
      AppDataSource.getRepository(Customer).create({ email: 'ivan@example.com' }),
    )
    const p = await seedYcpProduct()
    await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }], {
          customer: { full_name: 'Иван', phone: '+79991234567', email: 'IVAN@example.com' },
        }),
      )
    const [order] = await orders()
    expect(order.customerId).toBe(customer.id)
    expect(order.placedSignedIn).toBe(false)
  })

  it('подменённая цена — 409 с actual_inventory по цене сервера, заказа нет', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1 }]))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: 'Prices or availability changed',
      actual_inventory: {
        items: [
          {
            id: p.id,
            regular_price: 1500,
            final_price: 1500,
            warehouses: [{ id: 'msk-1', available_quantity: 99 }],
          },
        ],
      },
    })
    expect(await orders()).toHaveLength(0)
  })

  it('больше 99 штук — 409, в наличии 99', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 100, regular_price: 1500, final_price: 1500 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items[0].warehouses).toEqual([
      { id: 'msk-1', available_quantity: 99 },
    ])
  })

  it('нет в наличии — 409 с остатком 0', async () => {
    const p = await seedYcpProduct({ stockStatus: 'out_of_stock' })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items[0].warehouses[0].available_quantity).toBe(0)
  })

  it('неизвестный товар — 409 с присланными ценами и остатком 0', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: 'ghost', quantity: 1, regular_price: 10, final_price: 9 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items).toEqual([
      {
        id: 'ghost',
        regular_price: 10,
        final_price: 9,
        warehouses: [{ id: 'msk-1', available_quantity: 0 }],
      },
    ])
  })

  it('повтор сессии — 409; у отменённой сессии checkout_canceled: true', async () => {
    const p = await seedYcpProduct()
    const send = () =>
      request(app)
        .post(URL)
        .set(ycpAuth)
        .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]))
    expect((await send()).status).toBe(201)
    const again = await send()
    expect(again.status).toBe(409)
    expect(again.body).toEqual({
      error: 'Checkout session already exists',
      checkout_canceled: false,
    })
    await AppDataSource.getRepository(Order).update(
      { externalSessionId: 'sess-0001' },
      { status: 'cancelled' },
    )
    expect((await send()).body.checkout_canceled).toBe(true)
    expect(await orders()).toHaveLength(1)
  })

  it('два одновременных запроса одной сессии — один заказ, второй получает 409', async () => {
    const p = await seedYcpProduct()
    const body = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const results = await Promise.all([
      request(app).post(URL).set(ycpAuth).send(body),
      request(app).post(URL).set(ycpAuth).send(body),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await orders()).toHaveLength(1)
  })

  it('самовывоз не поддерживается — 400', async () => {
    const p = await seedYcpProduct()
    const base = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        ...base,
        delivery: {
          ...(base.delivery as Record<string, unknown>),
          delivery_method: 'self_pickup',
          address: { locality: 'Москва', address: 'ул. Примерная, 1' },
        },
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Self pickup is not supported' })
  })

  it('курьер без locality — 400', async () => {
    const p = await seedYcpProduct()
    const base = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        ...base,
        delivery: {
          ...(base.delivery as Record<string, unknown>),
          delivery_method: 'courier',
          address: { address: 'ул. Ленина, 1' },
        },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('locality')
  })

  it('повторяющиеся id: сравнивается сумма количеств — 60 + 60 больше 99, 409 и заказа нет', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([
          { id: p.id, quantity: 60, regular_price: 1500, final_price: 1500 },
          { id: p.id.toUpperCase(), quantity: 60, regular_price: 1500, final_price: 1500 },
        ]),
      )
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items).toEqual([
      {
        id: p.id,
        regular_price: 1500,
        final_price: 1500,
        warehouses: [{ id: 'msk-1', available_quantity: 99 }],
      },
    ])
    expect(await orders()).toHaveLength(0)
  })
})
