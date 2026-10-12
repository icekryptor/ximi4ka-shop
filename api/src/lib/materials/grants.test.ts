import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { Order } from '../../entities/Order.js'
import { loginAsCustomer, resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { claimOrdersByEmail, mergeCustomers } from '../account/customers.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import { grantMaterialsForOrder } from './grants.js'
import { addOrderItem, resetMaterialTables, seedMaterial, seedProduct } from './testUtils.js'

const grants = () => AppDataSource.getRepository(MaterialGrant)
const grantRows = () => grants().find({ order: { createdAt: 'ASC' } })

describe('выдача материалов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
  })

  describe('grantMaterialsForOrder', () => {
    it('выдаёт материалы товаров заказа, подарочные позиции тоже; один материал — одна выдача', async () => {
      const kit = await seedProduct('himichka-30')
      const mini = await seedProduct('mini-himichka')
      const gift = await seedProduct('elektrometodichka')
      const himichka = await seedMaterial({ title: 'Химичка', products: [kit, mini] })
      const electro = await seedMaterial({ title: 'Электро', products: [gift] })
      const order = await seedOrder({ customerEmail: ' Buyer@Example.COM ' })
      await addOrderItem(order.id, kit)
      await addOrderItem(order.id, mini)
      await addOrderItem(order.id, gift, { isGift: true })

      await grantMaterialsForOrder(AppDataSource.manager, order)

      const rows = await grantRows()
      expect(rows.map((r) => r.materialId).sort()).toEqual([himichka.id, electro.id].sort())
      expect(rows[0]).toMatchObject({
        orderId: order.id,
        customerId: null,
        email: 'buyer@example.com',
        source: 'order',
        revokedAt: null,
      })
    })

    it('идемпотентна: повторный вызов ничего не добавляет', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({ title: 'Химичка', products: [kit] })
      const order = await seedOrder()
      await addOrderItem(order.id, kit)

      await grantMaterialsForOrder(AppDataSource.manager, order)
      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grants().count()).toBe(1)
    })

    it('неактивный материал и заказ без материалов выдач не создают', async () => {
      const kit = await seedProduct('himichka-30')
      const plain = await seedProduct('reagent-x')
      await seedMaterial({ title: 'Выключен', isActive: false, products: [kit] })
      const order = await seedOrder()
      await addOrderItem(order.id, kit)
      await addOrderItem(order.id, plain)

      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grants().count()).toBe(0)
    })

    it('заказ покупателя с аккаунтом несёт customer_id; пустой email сохраняется как NULL', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({ title: 'Химичка', products: [kit] })
      const customer = await AppDataSource.getRepository(Customer).save({ email: 'c@example.com' })
      const order = await seedOrder({ customerId: customer.id, customerEmail: '' })
      await addOrderItem(order.id, kit)

      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grantRows()).toMatchObject([{ customerId: customer.id, email: null }])
    })
  })

  describe('единая точка оплаты saveOrderWithStatusEvent', () => {
    const PAID_AT = new Date('2026-10-12T10:00:00.000Z')

    function markPaid(order: Order, by: 'tbank' | 'admin' | 'reconcile') {
      const from = order.status
      order.status = 'paid'
      order.paidAt = PAID_AT
      order.statusHistory = [
        ...order.statusHistory,
        { from, to: 'paid', at: PAID_AT.toISOString(), by },
      ]
      return from
    }

    async function pendingOrderWithKit() {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      const order = await seedOrder({ status: 'pending' })
      await addOrderItem(order.id, kit)
      return { order, material }
    }

    it.each(['tbank', 'reconcile', 'admin'] as const)(
      'оплата (%s) выдаёт материал той же транзакцией',
      async (by) => {
        const { order, material } = await pendingOrderWithKit()

        await saveOrderWithStatusEvent(order, markPaid(order, by))

        expect(await grantRows()).toMatchObject([{ materialId: material.id, orderId: order.id }])
      },
    )

    it('paid → shipped и повторное сохранение paid новых выдач не создают', async () => {
      const { order } = await pendingOrderWithKit()
      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))
      await AppDataSource.query('DELETE FROM material_grants')

      await saveOrderWithStatusEvent(order, 'paid')
      order.status = 'shipped'
      await saveOrderWithStatusEvent(order, 'paid')

      expect(await grants().count()).toBe(0)
    })

    it('отмена оплаченного заказа выдачу не отзывает', async () => {
      const { order } = await pendingOrderWithKit()
      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))

      order.status = 'cancelled'
      await saveOrderWithStatusEvent(order, 'paid')

      expect(await grantRows()).toMatchObject([{ revokedAt: null }])
    })
  })

  describe('привязка гостевых выдач к аккаунту', () => {
    async function guestGrant(email: string) {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      await grants().save(
        grants().create({ materialId: material.id, email, source: 'admin', customerId: null }),
      )
      return material
    }

    it('claimOrdersByEmail привязывает выдачи с этим email и не трогает чужие', async () => {
      await guestGrant('buyer@example.com')
      const material = await seedMaterial({ title: 'Другая' })
      await grants().save(
        grants().create({
          materialId: material.id,
          email: 'other@example.com',
          source: 'admin',
          customerId: null,
        }),
      )
      const customer = await AppDataSource.getRepository(Customer).save({
        email: 'buyer@example.com',
      })

      await claimOrdersByEmail(AppDataSource.manager, customer.id, 'buyer@example.com')

      const rows = await grants().find()
      expect(rows.find((r) => r.email === 'buyer@example.com')?.customerId).toBe(customer.id)
      expect(rows.find((r) => r.email === 'other@example.com')?.customerId).toBeNull()
    })

    it('реальный вход по email привязывает выдачу — материал появляется в кабинете', async () => {
      await guestGrant('buyer@test.local')
      const app = createApp()

      const auth = await loginAsCustomer(app, 'buyer@test.local')

      const customer = await AppDataSource.getRepository(Customer).findOneByOrFail({
        email: 'buyer@test.local',
      })
      expect(auth.cookie).toContain('ximi4ka_customer_session')
      expect(await grants().findOneByOrFail({ email: 'buyer@test.local' })).toMatchObject({
        customerId: customer.id,
      })
    })

    it('слияние аккаунтов переносит выдачи удаляемого на оставшегося', async () => {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      const customers = AppDataSource.getRepository(Customer)
      const keep = await customers.save({ email: 'keep@example.com' })
      const drop = await customers.save({ email: 'drop@example.com' })
      await grants().save(
        grants().create({ materialId: material.id, customerId: drop.id, source: 'admin' }),
      )

      await mergeCustomers(AppDataSource.manager, keep.id, drop.id)

      expect(await grants().find()).toMatchObject([{ customerId: keep.id }])
    })
  })
})
