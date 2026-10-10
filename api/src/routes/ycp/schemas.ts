import { z } from 'zod'

// Входные данные методов YCP (docs/ycp/ycp-openapi-0.0.14.json). Поля, которые
// спецификация называет обязательными, но в своих же примерах опускает, здесь
// необязательны: отказ на них выключил бы кнопку.

// limit/offset обязательны по спецификации; без них отдаём первую страницу.
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(10_000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})

// Позиция корзины. id — строка до 80 символов, как offer id фида; не-uuid
// не ошибка: такого товара просто нет в ответе.
export const ItemRefSchema = z.object({
  id: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(10_000),
})

export const BasketCheckSchema = z.object({
  items: z.array(ItemRefSchema).min(1).max(100),
  // Обязательны по схеме, но пример запроса Яндекса их опускает. Ответ от них
  // не зависит: id у нас один и тот же в обоих режимах, остаток не региональный,
  // проверка здоровья отвечает как настоящий запрос.
  offers_id_from_merchant_center: z.boolean().optional(),
  locality: z.string().max(255).optional(),
  is_health_check: z.boolean().optional(),
})
