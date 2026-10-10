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
import { listCustomerOrders } from '../lib/account/orders.js'
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
    await seedOrder({ customerId: c.id, placedSignedIn: true })
    await seedOrder({
      customerId: c.id,
      placedSignedIn: true,
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

  it('lastDelivery не берёт заказ, привязанный только по email (не вживую)', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    // customerId проставлен (как claimOrdersByEmail сделала бы), но
    // placedSignedIn остаётся false — заказ не был оформлен вживую этим
    // покупателем, значит адрес мог быть чужим (спека кабинета §4.4).
    await seedOrder({ customerId: c.id, placedSignedIn: false })
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.body.data.lastDelivery).toBeNull()
  })

  it('lastDelivery игнорирует отменённый вживую-заказ и берёт следующий по свежести', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    await seedOrder({
      customerId: c.id,
      placedSignedIn: true,
      status: 'paid',
      deliveryMethod: 'cdek_courier',
      deliveryAddress: {
        address: 'Казань, ул. Баумана, 5, кв. 12',
        comment: null,
        cityCode: 424,
        postalCode: '420111',
      },
    })
    const cancelled = await seedOrder({
      customerId: c.id,
      placedSignedIn: true,
      status: 'cancelled',
    })
    await AppDataSource.query(
      `UPDATE orders SET created_at = now() + interval '1 minute' WHERE id = $1`,
      [cancelled.id],
    )
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.body.data.lastDelivery).toMatchObject({ method: 'cdek_courier', cityName: 'Казань' })
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
      items: [
        {
          name: 'Набор',
          quantity: 2,
          unitPriceRub: 1500,
          // Позиция без line_total_rub (заказ до оптовых партий): цена × количество.
          lineTotalRub: 3000,
          imageUrl: '/uploads/kit.webp',
        },
      ],
      subtotalRub: 1500,
      discountRub: 0,
      shippingRub: 0,
      deliveryMethod: 'cdek_pvz',
      deliveryAddress: 'Москва, ул. Ленина, 1',
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

  it('GET /orders: подробности — все позиции (не первые три), суммы и доставка; чужие не видны', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    const stranger = await AppDataSource.getRepository(Customer).save({ email: 'x@y.ru' })
    const strangerOrder = await seedOrder({
      customerId: stranger.id,
      deliveryAddress: { address: 'Секретный адрес, 13', comment: null, cityCode: 1 },
    })
    const products = AppDataSource.getRepository(Product)
    const saved: Product[] = []
    for (let i = 1; i <= 5; i++) {
      saved.push(
        await products.save(
          products.create({
            slug: `p${i}`,
            name: `Товар ${i}`,
            priceRub: 100 * i,
            stockStatus: 'in_stock',
            isPublished: true,
            longDescriptionBlocks: [],
            translations: {},
          }),
        ),
      )
    }
    const items = AppDataSource.getRepository(OrderItem)
    await items.save({
      orderId: strangerOrder.id,
      productId: saved[0].id,
      productSnapshot: { name: 'Чужой товар', sku: null, priceRub: 100 },
      quantity: 1,
      unitPriceRub: 100,
    })
    const mine = await seedOrder({
      customerId: c.id,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: {
        address: 'Казань, ул. Баумана, 5, кв. 12',
        comment: null,
        cityCode: 424,
        postalCode: '420111',
      },
      subtotalRub: 1500,
      discountRub: 100,
      shippingRub: 250,
      totalRub: 1650,
    })
    for (const [i, p] of saved.entries()) {
      await items.save({
        orderId: mine.id,
        productId: p.id,
        productSnapshot: { name: p.name, sku: null, priceRub: p.priceRub },
        quantity: i + 1,
        unitPriceRub: p.priceRub,
        // У третьей позиции сумма партии сохранена и не равна цене × количество.
        lineTotalRub: i === 2 ? 880 : null,
      })
    }

    const res = await request(app).get('/api/account/orders').set(customerHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data.orders).toHaveLength(1)
    const o = res.body.data.orders[0]
    expect(o.items).toHaveLength(5)
    expect(o.items.map((i: { name: string }) => i.name).sort()).toEqual([
      'Товар 1',
      'Товар 2',
      'Товар 3',
      'Товар 4',
      'Товар 5',
    ])
    expect(o.items.find((i: { name: string }) => i.name === 'Товар 3')).toMatchObject({
      quantity: 3,
      unitPriceRub: 300,
      lineTotalRub: 880,
      imageUrl: null,
    })
    expect(o.items.find((i: { name: string }) => i.name === 'Товар 2')).toMatchObject({
      lineTotalRub: 400,
    })
    expect(o.itemCount).toBe(15)
    expect(o).toMatchObject({
      subtotalRub: 1500,
      discountRub: 100,
      shippingRub: 250,
      totalRub: 1650,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: 'Казань, ул. Баумана, 5, кв. 12',
    })
    // Чужой заказ (его позиции и адрес) в ответе не появляется.
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('Секретный адрес')
    expect(body).not.toContain('Чужой товар')
    expect(body).not.toContain(strangerOrder.orderNumber)
  })

  it('GET /orders: подарочная позиция помечена isGift, обычная — нет', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    const products = AppDataSource.getRepository(Product)
    const [kit, reagent] = await Promise.all(
      [
        ['kit', 'Набор', 3000],
        ['iodat-kaliya', 'Йодат калия', 249],
      ].map(([slug, name, priceRub]) =>
        products.save(
          products.create({
            slug: slug as string,
            name: name as string,
            priceRub: priceRub as number,
            stockStatus: 'in_stock',
            isPublished: true,
            longDescriptionBlocks: [],
            translations: {},
          }),
        ),
      ),
    )
    const order = await seedOrder({ customerId: c.id, subtotalRub: 3000, totalRub: 3000 })
    const items = AppDataSource.getRepository(OrderItem)
    await items.save({
      orderId: order.id,
      productId: kit.id,
      productSnapshot: { name: 'Набор', sku: null, priceRub: 3000 },
      quantity: 1,
      unitPriceRub: 3000,
      lineTotalRub: 3000,
    })
    await items.save({
      orderId: order.id,
      productId: reagent.id,
      productSnapshot: { name: 'Йодат калия', sku: 'KIO3', priceRub: 249 },
      quantity: 1,
      unitPriceRub: 0,
      lineTotalRub: 0,
      isGift: true,
    })

    const res = await request(app).get('/api/account/orders').set(customerHeaders(auth))

    const byName = new Map(
      res.body.data.orders[0].items.map((i: { name: string }) => [i.name, i] as const),
    )
    expect(byName.get('Йодат калия')).toMatchObject({ isGift: true, lineTotalRub: 0 })
    expect(byName.get('Набор')).toMatchObject({ isGift: false })
  })

  it('битый курсор — 400', async () => {
    const auth = await loginAsCustomer(app, 'buyer@test.local', new MemoryMailer())
    const res = await request(app).get('/api/account/orders?cursor=junk').set(customerHeaders(auth))
    expect(res.status).toBe(400)
  })

  it('курсор не теряет заказы, у которых created_at совпадает до миллисекунды', async () => {
    await loginAsCustomer(app)
    const c = await me()
    // Три заказа в одной миллисекунде (10:00:00.123), но с разными микросекундами
    // и достаточно близкими id-хвостами, чтобы пара (created_at мс, id) не была
    // монотонной по настоящему created_at — именно это раньше роняло заказы.
    const o1 = await seedOrder({ customerId: c.id })
    const o2 = await seedOrder({ customerId: c.id })
    const o3 = await seedOrder({ customerId: c.id })
    await AppDataSource.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      '2026-09-01 10:00:00.123100',
      o1.id,
    ])
    await AppDataSource.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      '2026-09-01 10:00:00.123200',
      o2.id,
    ])
    await AppDataSource.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      '2026-09-01 10:00:00.123300',
      o3.id,
    ])

    const seen: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 3; i++) {
      const page = await listCustomerOrders(c.id, cursor, 1)
      expect(page.orders).toHaveLength(1)
      seen.push(page.orders[0].orderNumber)
      cursor = page.nextCursor
    }
    expect(cursor).toBeNull()
    expect(new Set(seen)).toEqual(new Set([o1.orderNumber, o2.orderNumber, o3.orderNumber]))
  })
})
