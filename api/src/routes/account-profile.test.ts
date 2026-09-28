import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CdekShipment } from '../entities/CdekShipment.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { Product } from '../entities/Product.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'
import { customerHeaders, loginAsCustomer, resetAccountTables, seedOrder } from './testUtils.js'

describe('профиль и заказы', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await AppDataSource.query('TRUNCATE products RESTART IDENTITY CASCADE')
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  async function me() {
    return AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'buyer@test.local' })
  }

  it('GET /me без сессии — 401; с сессией — профиль без lastDelivery', async () => {
    expect((await request(app).get('/api/account/me')).status).toBe(401)
    const auth = await loginAsCustomer(app)
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      email: 'buyer@test.local',
      hasTelegram: false,
      telegramUsername: null,
      name: null,
      phone: null,
      lastDelivery: null,
    })
  })

  it('lastDelivery из последнего заказа: ПВЗ и курьер', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    // Первый — ПВЗ (по умолчанию в seedOrder), второй, более новый, — курьер.
    await seedOrder({ customerId: c.id })
    await seedOrder({
      customerId: c.id,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: {
        address: 'Казань, ул. Баумана, 5, кв. 12',
        comment: null,
        cityCode: 424,
        postalCode: '420111',
      },
    })
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.body.data.lastDelivery).toEqual({
      method: 'cdek_courier',
      cityCode: 424,
      cityName: 'Казань',
      deliveryPointCode: null,
      postalCode: '420111',
      courierStreet: 'ул. Баумана, 5, кв. 12',
    })
  })

  it('PATCH /me меняет имя и телефон, требует CSRF, валидирует', async () => {
    const auth = await loginAsCustomer(app)
    const noCsrf = await request(app)
      .patch('/api/account/me')
      .set('Cookie', auth.cookie)
      .send({ name: 'Иван' })
    expect(noCsrf.status).toBe(403)
    const ok = await request(app)
      .patch('/api/account/me')
      .set(customerHeaders(auth))
      .send({ name: '  Иван  ', phone: '+79001234567' })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ name: 'Иван', phone: '+79001234567' })
    const bad = await request(app)
      .patch('/api/account/me')
      .set(customerHeaders(auth))
      .send({ phone: '1' })
    expect(bad.status).toBe(400)
  })

  it('GET /orders: только свои, новые сверху, позиции с картинкой, трек, курсор', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    const stranger = await AppDataSource.getRepository(Customer).save({ email: 'x@y.ru' })
    await seedOrder({ customerId: stranger.id })

    const product = await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        slug: 'kit',
        name: 'Набор',
        priceRub: 1500,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    await AppDataSource.query(
      `INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, '/uploads/kit.webp', 'Набор', 0)`,
      [product.id],
    )

    const created: Order[] = []
    for (let i = 0; i < 22; i++) {
      const o = await seedOrder({ customerId: c.id })
      await AppDataSource.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
        new Date(Date.UTC(2026, 8, 1, 0, i)),
        o.id,
      ])
      created.push(o)
    }
    const newest = created[21]
    await AppDataSource.getRepository(OrderItem).save({
      orderId: newest.id,
      productId: product.id,
      productSnapshot: { name: 'Набор', sku: null, priceRub: 1500 },
      quantity: 2,
      unitPriceRub: 1500,
    })
    await AppDataSource.getRepository(CdekShipment).save({
      orderId: newest.id,
      state: 'created',
      cdekNumber: '1234567890',
    })

    const page1 = await request(app).get('/api/account/orders').set(customerHeaders(auth))
    expect(page1.status).toBe(200)
    expect(page1.body.data.orders).toHaveLength(20)
    const first = page1.body.data.orders[0]
    expect(first).toMatchObject({
      orderNumber: newest.orderNumber,
      publicToken: newest.publicToken,
      itemCount: 2,
      items: [{ name: 'Набор', quantity: 2, imageUrl: '/uploads/kit.webp' }],
      shipment: { state: 'created', trackingNumber: '1234567890' },
    })
    expect(page1.body.data.nextCursor).toBeTruthy()

    const page2 = await request(app)
      .get(`/api/account/orders?cursor=${encodeURIComponent(page1.body.data.nextCursor)}`)
      .set(customerHeaders(auth))
    expect(page2.body.data.orders).toHaveLength(2)
    expect(page2.body.data.nextCursor).toBeNull()
    const all = [...page1.body.data.orders, ...page2.body.data.orders].map(
      (o: { orderNumber: string }) => o.orderNumber,
    )
    expect(new Set(all).size).toBe(22)
  })

  it('битый курсор — 400', async () => {
    const auth = await loginAsCustomer(app, 'buyer@test.local', new MemoryMailer())
    const res = await request(app).get('/api/account/orders?cursor=junk').set(customerHeaders(auth))
    expect(res.status).toBe(400)
  })
})
