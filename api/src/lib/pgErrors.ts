// Нарушение уникального индекса Postgres (23505). TypeORM переносит code из
// ошибки драйвера в QueryFailedError.
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}
