import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

// Ошибки YCP — в формате Яндекса {"error": "<строка>"} (спека, «Формат
// ответов»), а не {error:{code,message}} нашего API. body — дополнительные
// поля ответа 409 на /checkout (actual_inventory, checkout_canceled).
export class YcpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'YcpError'
  }
}

export function ycpBadRequest(message: string): YcpError {
  return new YcpError(400, message)
}

export function ycpNotFound(message: string): YcpError {
  return new YcpError(404, message)
}

export function ycpConflict(message: string, body?: Record<string, unknown>): YcpError {
  return new YcpError(409, message, body)
}

function zodMessage(err: ZodError): string {
  const issue = err.issues[0]
  const where = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : 'body'
  return `Invalid request format: ${where}: ${issue?.message ?? 'invalid value'}`
}

// Подключён в app.ts на /api/v1 после роутера и до общего errorHandler:
// так он ловит и ошибки роутера, и битый JSON из express.json().
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ycpErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof YcpError) {
    res.status(err.status).json({ error: err.message, ...err.body })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: zodMessage(err) })
    return
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'Invalid request format: malformed JSON' })
    return
  }
  console.error('ycp:', err)
  res.status(500).json({ error: 'Failed to process request' })
}
