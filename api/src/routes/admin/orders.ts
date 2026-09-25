import { Router } from 'express'
import { z } from 'zod'
import { IsNull, In, Not } from 'typeorm'
import type { CdekShipmentDto } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { OrdersListQuerySchema, OrderStatusPatchSchema } from './orders.schemas.js'
import { conflict, notFound } from '../errors.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { cdekOrdersEnabled } from '../../lib/cdek/orders.js'
import { enqueueCdekShipment, isCdekDelivery } from '../../lib/cdek/queue.js'
import { cdekWorkerStatus } from '../../lib/cdek/worker.js'

export const adminOrdersRouter: Router = Router()

adminOrdersRouter.use(requireAdminAuth)
adminOrdersRouter.use(requireCsrfToken)

async function orderNotifications(orderId: string) {
  const rows = await AppDataSource.getRepository(OrderNotification).find({
    where: { orderId },
    order: { createdAt: 'ASC', channel: 'ASC' },
  })
  return rows.map((n) => ({
    channel: n.channel,
    eventKey: n.eventKey,
    attempts: n.attempts,
    nextAttemptAt: n.nextAttemptAt.toISOString(),
    sentAt: n.sentAt?.toISOString() ?? null,
    failedAt: n.failedAt?.toISOString() ?? null,
    lastError: n.lastError,
  }))
}

function cdekShipmentDto(s: CdekShipment): CdekShipmentDto {
  return {
    state: s.state,
    cdekNumber: s.cdekNumber,
    attempts: s.attempts,
    nextAttemptAt: s.nextAttemptAt.toISOString(),
    lastError: s.lastError,
    updatedAt: s.updatedAt.toISOString(),
  }
}

async function cdekShipment(orderId: string): Promise<CdekShipmentDto | null> {
  const s = await AppDataSource.getRepository(CdekShipment).findOneBy({ orderId })
  return s ? cdekShipmentDto(s) : null
}

// List — newest first, optional status filter.
adminOrdersRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, status } = OrdersListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Order)
    const [items, total] = await repo.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Detail — items included (snapshots carry the composition even if the
// products were later edited or deleted).
adminOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const repo = AppDataSource.getRepository(Order)
    const order = await repo.findOne({
      where: { id: id.data },
      relations: { items: true },
    })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')
    const ordersEnabled = cdekOrdersEnabled()
    res.json({
      data: {
        ...order,
        notifications: await orderNotifications(order.id),
        cdekShipment: await cdekShipment(order.id),
        cdekOrdersEnabled: ordersEnabled,
        // Флаг выключен — почему обработчик не запущен неважно, он и не
        // должен быть запущен. Флаг включён — если обработчик всё же не
        // поднялся (настройка сломана), админ должен это увидеть, а не
        // гадать по 0 попыток «в очереди» (F1).
        cdekWorkerProblem: ordersEnabled ? cdekWorkerStatus().problem : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

// Ручная смена статуса: «Отметить оплаченным» / «Отменить» / «Отметить отправленным».
adminOrdersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const { status, comment } = OrderStatusPatchSchema.parse(req.body)

    const repo = AppDataSource.getRepository(Order)
    const order = await repo.findOne({
      where: { id: id.data },
      relations: { items: true },
    })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')

    if (order.status === status) {
      throw conflict('status_unchanged', 'Заказ уже находится в этом статусе')
    }
    // «Отправлен» ставится только оплаченному заказу. Оплаченный заказ — это
    // деньги: вернуть его в другое состояние можно только отправкой (возвраты —
    // отдельная будущая история). Отправленный заказ вручную не меняется.
    if (status === 'shipped' && order.status !== 'paid') {
      throw conflict('order_not_paid', 'Отправить можно только оплаченный заказ')
    }
    if (order.status === 'paid' && status !== 'shipped') {
      throw conflict('order_already_paid', 'Оплаченный заказ нельзя изменить вручную')
    }
    if (order.status === 'shipped') {
      throw conflict('order_already_shipped', 'Отправленный заказ нельзя изменить вручную')
    }

    const now = new Date()
    const from = order.status
    order.status = status
    if (status === 'paid' && !order.paidAt) order.paidAt = now
    order.statusHistory = [
      ...(order.statusHistory ?? []),
      {
        from,
        to: status,
        at: now.toISOString(),
        by: 'admin' as const,
        ...(comment ? { comment } : {}),
      },
    ]
    const saved = await saveOrderWithStatusEvent(order, from)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// «Отправить ещё раз»: несданные записи возвращаются в очередь как новые.
adminOrdersRouter.post('/:id/notifications/retry', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const exists = await AppDataSource.getRepository(Order).exists({ where: { id: id.data } })
    if (!exists) throw notFound('order_not_found', 'Заказ не найден')
    await AppDataSource.getRepository(OrderNotification).update(
      { orderId: id.data, failedAt: Not(IsNull()) },
      { failedAt: null, attempts: 0, lastError: null, nextAttemptAt: new Date() },
    )
    res.json({ data: await orderNotifications(id.data) })
  } catch (err) {
    next(err)
  }
})

// «Создать в СДЭК ещё раз»: запись возвращается в очередь со свежим окном
// повторов, у оплаченного заказа без записи — создаётся. Созданный или ещё
// регистрирующийся заказ не трогаем — иначе дубль.
adminOrdersRouter.post('/:id/cdek/retry', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const order = await AppDataSource.getRepository(Order).findOneBy({ id: id.data })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')
    if (!cdekOrdersEnabled()) {
      throw conflict('cdek_orders_disabled', 'Создание заказов в СДЭК выключено')
    }
    // Флаг включён, но обработчик не поднялся (сломанная настройка) — класть
    // записи в очередь некому, кнопка только создавала бы висящие записи (F1).
    if (!cdekWorkerStatus().running) {
      throw conflict(
        'cdek_worker_stopped',
        'Обработчик очереди СДЭК не запущен — проверьте настройки сервера',
      )
    }
    if (order.status !== 'paid' && order.status !== 'shipped') {
      throw conflict('order_not_paid', 'Заказ не оплачен')
    }
    if (!isCdekDelivery(order.deliveryMethod)) {
      throw conflict('not_cdek_delivery', 'Доставка не СДЭК')
    }
    const repo = AppDataSource.getRepository(CdekShipment)
    const existing = await repo.findOneBy({ orderId: order.id })
    // Без записи и уже отправлен — вручную заведённый в СДЭК заказ (принят до
    // включения автосоздания или до самого этапа 4): создавать не предлагаем,
    // это не «оплачен, но забыли поставить в очередь» (F4).
    if (!existing && order.status !== 'paid') {
      throw conflict(
        'cdek_not_queued',
        'Заказ отправлен до автосоздания — создайте в СДЭК вручную, если нужно',
      )
    }
    if (existing?.state === 'created') {
      throw conflict('cdek_already_created', 'Заказ уже создан в СДЭК')
    }
    if (existing?.state === 'registering') {
      throw conflict('cdek_registering', 'СДЭК ещё регистрирует заказ')
    }
    if (existing) {
      // Между чтением выше и этим UPDATE обработчик мог успеть перевести
      // запись в registering — условие в WHERE защищает от перезаписи его
      // прогресса тем же способом, что и он сам (F2). submittedAt сбрасываем:
      // повтор начинает регистрацию заново, старое время начала — не про
      // текущую попытку (F3); cdekUuid не трогаем — обработчик всегда сперва
      // ищет заказ по номеру, прежний uuid не мешает.
      const result = await repo.update(
        { id: existing.id, state: In(['queued', 'failed']) },
        {
          state: 'queued',
          attempts: 0,
          lastError: null,
          nextAttemptAt: new Date(),
          submittedAt: null,
        },
      )
      if (!result.affected) {
        throw conflict('cdek_registering', 'СДЭК ещё регистрирует заказ')
      }
    } else {
      await enqueueCdekShipment(AppDataSource.manager, order)
    }
    res.json({ data: cdekShipmentDto(await repo.findOneByOrFail({ orderId: order.id })) })
  } catch (err) {
    next(err)
  }
})
