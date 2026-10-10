import { z } from 'zod'

// Входные данные методов YCP (docs/ycp/ycp-openapi-0.0.14.json). Поля, которые
// спецификация называет обязательными, но в своих же примерах опускает, здесь
// необязательны: отказ на них выключил бы кнопку.

// limit/offset обязательны по спецификации; без них отдаём первую страницу.
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(10_000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})
