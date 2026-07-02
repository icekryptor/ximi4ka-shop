import { createHash, timingSafeEqual } from 'node:crypto'

// Т-Касса request signature ("Token").
//
// Per the official docs (developer.tbank.ru → Прием платежей → Токен):
//   1. Take only ROOT-LEVEL parameters of the request object — nested
//      objects and arrays (Receipt, DATA, ...) are excluded.
//   2. Add {"Password": <terminal password>} as another pair.
//   3. Sort the pairs alphabetically by key.
//   4. Concatenate the VALUES only into a single string.
//   5. SHA-256 (UTF-8) the string; the lowercase hex digest is the Token.
//
// Booleans are serialized lowercase ("true"/"false") and numbers in plain
// decimal notation — this matches the official notification example where
// Success: true participates as "true".

function serializeScalar(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function buildTokenString(
  params: Record<string, unknown>,
  password: string,
): string {
  const pairs: Array<[string, string]> = []
  for (const [key, value] of Object.entries(params)) {
    // The signature itself never participates in signing.
    if (key === 'Token') continue
    if (value === null || value === undefined) continue
    // Nested objects/arrays are excluded per the docs.
    if (typeof value === 'object') continue
    pairs.push([key, serializeScalar(value as string | number | boolean)])
  }
  pairs.push(['Password', password])
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return pairs.map(([, v]) => v).join('')
}

export function generateToken(
  params: Record<string, unknown>,
  password: string,
): string {
  return createHash('sha256')
    .update(buildTokenString(params, password), 'utf8')
    .digest('hex')
}

// Constant-time comparison — a plain === on attacker-controlled input would
// leak the position of the first mismatching character.
export function verifyToken(
  params: Record<string, unknown>,
  password: string,
  token: string,
): boolean {
  const expected = generateToken(params, password)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(token.toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
