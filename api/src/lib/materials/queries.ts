import type { AccountMaterial, PublicOrderMaterial } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Неверный uuid в пути иначе дошёл бы до Postgres и вернул 500.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

interface ListRow {
  id: string
  title: string
  kind: 'file' | 'link'
  external_url: string | null
  file_name: string | null
  size_bytes: number | null
  granted_at: Date
}

/** Материалы покупателя: действующие выдачи, по одной строке на материал. */
export async function listCustomerMaterials(customerId: string): Promise<AccountMaterial[]> {
  const rows: ListRow[] = await AppDataSource.query(
    `SELECT lm.id, lm.title, lm.kind, lm.external_url, lm.file_name, lm.size_bytes,
            min(g.created_at) AS granted_at
     FROM material_grants g
     JOIN learning_materials lm ON lm.id = g.material_id
     WHERE g.customer_id = $1 AND g.revoked_at IS NULL AND lm.is_active
     GROUP BY lm.id
     ORDER BY min(g.created_at) DESC, lm.title`,
    [customerId],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    ...(r.kind === 'link' && r.external_url ? { url: r.external_url } : {}),
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    grantedAt: r.granted_at.toISOString(),
  }))
}

/** Материал, выданный покупателю (не отозван, активен), иначе null. */
export async function findCustomerMaterial(
  customerId: string,
  materialId: string,
): Promise<LearningMaterial | null> {
  return AppDataSource.getRepository(LearningMaterial)
    .createQueryBuilder('m')
    .where('m.id = :materialId AND m.is_active = true', { materialId })
    .andWhere(
      `EXISTS (SELECT 1 FROM material_grants g
               WHERE g.material_id = m.id AND g.customer_id = :customerId AND g.revoked_at IS NULL)`,
      { customerId },
    )
    .getOne()
}

/** Материалы заказа для страницы «спасибо»: без путей к файлам. */
export async function listOrderMaterials(orderId: string): Promise<PublicOrderMaterial[]> {
  const rows: Pick<ListRow, 'id' | 'title' | 'kind' | 'external_url'>[] = await AppDataSource.query(
    `SELECT DISTINCT lm.id, lm.title, lm.kind, lm.external_url
       FROM material_grants g
       JOIN learning_materials lm ON lm.id = g.material_id
       WHERE g.order_id = $1 AND g.revoked_at IS NULL AND lm.is_active
       ORDER BY lm.title`,
    [orderId],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    ...(r.kind === 'link' && r.external_url ? { url: r.external_url } : {}),
  }))
}

/** Материал, выданный заказу (не отозван, активен), иначе null. */
export async function findOrderMaterial(
  orderId: string,
  materialId: string,
): Promise<LearningMaterial | null> {
  return AppDataSource.getRepository(LearningMaterial)
    .createQueryBuilder('m')
    .where('m.id = :materialId AND m.is_active = true', { materialId })
    .andWhere(
      `EXISTS (SELECT 1 FROM material_grants g
               WHERE g.material_id = m.id AND g.order_id = :orderId AND g.revoked_at IS NULL)`,
      { orderId },
    )
    .getOne()
}
