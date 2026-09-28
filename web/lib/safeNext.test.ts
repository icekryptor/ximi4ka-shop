import { describe, it, expect } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext', () => {
  it.each([
    ['/checkout', '/checkout'],
    ['/account/profile?x=1', '/account/profile?x=1'],
    ['//evil.ru', '/account'],
    ['https://evil.ru', '/account'],
    ['/\\evil.ru', '/account'],
    ['javascript:alert(1)', '/account'],
    ['', '/account'],
    [undefined, '/account'],
    [['/a', '/b'], '/account'],
    ['/\t/evil.ru', '/account'],
    ['/\n/evil.ru', '/account'],
    ['/\r/evil.ru', '/account'],
  ])('%s → %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected)
  })
})
