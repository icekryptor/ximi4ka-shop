import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

// Ответы сжимает Caddy (`encode zstd gzip` в блоках ximi4ka.ru и new.ximi4ka.ru),
// а не Next. Встроенный в Next пакет compression сбрасывает gzip-поток после
// каждой порции потокового HTML с Z_FULL_FLUSH — словарь обнуляется, и главная
// весила 57 КБ вместо 37 КБ (zstd от Caddy). Пока Next сжимал сам, Caddy пропускал
// уже сжатый ответ. Подробности — deploy/README.md, раздел «Сжатие и HSTS».
describe('next.config', () => {
  it('не сжимает ответы — это делает Caddy', () => {
    expect(nextConfig.compress).toBe(false)
  })
})
