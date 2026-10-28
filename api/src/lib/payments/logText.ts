const MAX_LOG_TEXT = 300

// Чужой текст в лог: наши значения вычёркиваем, управляющие символы убираем, длину режем.
export function clip(value: unknown, secrets: Array<string | null | undefined> = []): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '-'
  let text = String(value)
  for (const secret of secrets) {
    if (secret && secret.length >= 4) text = text.split(secret).join('[redacted]')
  }
  const line = text
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LOG_TEXT)
  return line.length > 0 ? line : '-'
}

// У упавшего fetch причина лежит в cause.code (ECONNREFUSED, ETIMEDOUT…).
export function errMessage(err: unknown, secrets: Array<string | null | undefined>): string {
  const message = clip(err instanceof Error ? err.message : err, secrets)
  const code = (err as { cause?: { code?: unknown } } | null | undefined)?.cause?.code
  return typeof code === 'string' ? `${message} (${clip(code)})` : message
}
