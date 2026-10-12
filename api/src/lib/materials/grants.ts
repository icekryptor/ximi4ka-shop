import type { EntityManager } from 'typeorm'
import type { Order } from '../../entities/Order.js'

// Выдаёт заказу материалы, привязанные к его товарам (подарочные позиции тоже).
// Один INSERT … SELECT, чтобы не усложнять денежный путь: вызывается в той же
// транзакции, что и запись оплаты (writeOrderStatusEvent). Идемпотентна —
// уникальный индекс (order_id, material_id) и DO NOTHING.
// customer_id берётся из БД, а не из объекта заказа: между загрузкой заказа и
// транзакцией оплаты его могли привязать (claim) или слить (merge) — зафиксированное
// значение не даёт ни нарушения внешнего ключа, ни выдачи без владельца.
export async function grantMaterialsForOrder(em: EntityManager, order: Order): Promise<void> {
  const email = order.customerEmail ? order.customerEmail.trim().toLowerCase() : ''
  await em.query(
    `INSERT INTO material_grants (material_id, order_id, customer_id, email, source)
     SELECT DISTINCT lmp.material_id, $1::uuid, (SELECT customer_id FROM orders WHERE id = $1::uuid), NULLIF($2::text, ''), 'order'
     FROM order_items oi
     JOIN learning_material_products lmp ON lmp.product_id = oi.product_id
     JOIN learning_materials lm ON lm.id = lmp.material_id AND lm.is_active
     WHERE oi.order_id = $1::uuid
     ON CONFLICT (order_id, material_id) WHERE order_id IS NOT NULL DO NOTHING`,
    [order.id, email],
  )
}
