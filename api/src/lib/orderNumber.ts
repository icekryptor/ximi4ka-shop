import type { EntityManager } from 'typeorm'

// Order numbers look like XM-2026-00042. The numeric part comes from the
// Postgres sequence `order_number_seq` (created in the AddOrderPaymentFields
// migration): nextval() is atomic under concurrency, so two simultaneous
// checkouts can never mint the same number. The counter is global (not
// per-year) — it only ever moves forward, which keeps numbers unique even
// across a year boundary.
export function formatOrderNumber(year: number, seq: number): string {
  return `XM-${year}-${String(seq).padStart(5, '0')}`
}

export async function nextOrderNumber(
  manager: EntityManager,
  now: Date = new Date(),
): Promise<string> {
  const rows = (await manager.query(
    `SELECT nextval('order_number_seq') AS n`,
  )) as Array<{ n: string | number }>
  return formatOrderNumber(now.getFullYear(), Number(rows[0].n))
}
