import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(code: string, message: string): ApiError {
  return new ApiError(404, code, message)
}

export function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message)
}

export function badRequest(code: string, message: string, details?: unknown): ApiError {
  return new ApiError(400, code, message, details)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request body',
        details: err.issues,
      },
    })
    return
  }
  console.error(err)
  res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error' },
  })
}
