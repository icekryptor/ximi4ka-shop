import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Customer } from './Customer.js'
import { Order } from './Order.js'
import { resetAccountTables, seedOrder } from '../routes/testUtils.js'

describe('customers', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(resetAccountTables)

  it('покупатель без email и без Telegram не сохраняется', async () => {
    const repo = AppDataSource.getRepository(Customer)
    await expect(repo.save(repo.create({ name: 'Иван' }))).rejects.toThrow(
      /CHK_customers_login_method/,
    )
  })

  it('email и telegram_id уникальны', async () => {
    const repo = AppDataSource.getRepository(Customer)
    await repo.save(repo.create({ email: 'a@b.ru' }))
    await expect(repo.save(repo.create({ email: 'a@b.ru' }))).rejects.toThrow()
    await repo.save(repo.create({ telegramId: 42 }))
    await expect(repo.save(repo.create({ telegramId: 42 }))).rejects.toThrow()
  })

  it('telegram_id читается числом', async () => {
    const repo = AppDataSource.getRepository(Customer)
    const saved = await repo.save(repo.create({ telegramId: 7_000_000_001 }))
    const loaded = await repo.findOneByOrFail({ id: saved.id })
    expect(loaded.telegramId).toBe(7_000_000_001)
  })

  it('удаление покупателя отвязывает заказ, но не удаляет его', async () => {
    const repo = AppDataSource.getRepository(Customer)
    const c = await repo.save(repo.create({ email: 'a@b.ru' }))
    const order = await seedOrder({ customerId: c.id })
    await repo.delete({ id: c.id })
    const reloaded = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(reloaded.customerId).toBeNull()
  })
})
