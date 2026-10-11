import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { ycpTokenFromEnv } from '../../lib/ycp/config.js'

// sha256 выравнивает длины: timingSafeEqual требует буферы одной длины, а
// отдельное сравнение длин выдало бы длину токена.
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function isValidYcpToken(header: string | undefined, expected: string | null): boolean {
  if (!expected || !header) return false
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return false
  return timingSafeEqual(digest(match[1]), digest(expected))
}

// Яндекс шлёт «Authorization: Bearer <токен>» на каждый вызов (спека YCP,
// «Доступ»). Токен не задан или короток — не пускаем никого.
export function requireYcpToken(req: Request, res: Response, next: NextFunction): void {
  if (isValidYcpToken(req.header('Authorization'), ycpTokenFromEnv())) {
    next()
    return
  }
  res.status(401).json({ error: 'Unauthorized' })
}
