// Внешний сервис попросил подождать (HTTP 429). Это не неудачная попытка:
// обработчик очереди откладывает запись на retryAfterMs, не увеличивая
// attempts и не приближая сдачу, и до конца тика больше не трогает канал.
export class RateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}
