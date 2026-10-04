import { describe, it, expect, vi } from 'vitest'
import { TelegramLoginBot } from './loginBot.js'
import {
  pollOnce,
  getLoginPollerHealth,
  markPollerStarted,
  markPollerOk,
  resetLoginPollerHealth,
} from './loginPoller.js'

function botWith(result: unknown[]) {
  const f = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, result }), { status: 200 }))
  return new TelegramLoginBot({ token: 'T', username: 'b', polling: true, fetch: f })
}

describe('pollOnce', () => {
  it('обрабатывает update по порядку и сдвигает offset за последний', async () => {
    const seen: number[] = []
    const bot = botWith([{ update_id: 10 }, { update_id: 11 }])
    const next = await pollOnce(bot, undefined, async (_b, u) => {
      seen.push((u as unknown as { update_id: number }).update_id)
    })
    expect(seen).toEqual([10, 11])
    expect(next).toBe(12)
  })

  it('пустая пачка — offset не меняется', async () => {
    expect(await pollOnce(botWith([]), 5, async () => {})).toBe(5)
  })

  it('упавший update не останавливает остальные и не откатывает offset', async () => {
    const seen: number[] = []
    const bot = botWith([{ update_id: 1 }, { update_id: 2 }])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const next = await pollOnce(bot, undefined, async (_b, u) => {
      const id = (u as unknown as { update_id: number }).update_id
      if (id === 1) throw new Error('boom')
      seen.push(id)
    })
    spy.mockRestore()
    expect(seen).toEqual([2])
    expect(next).toBe(3)
  })

  it('ошибка getUpdates пробрасывается — цикл сам решит про паузу', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: 'Conflict' }), { status: 409 }),
      )
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', polling: true, fetch: f })
    await expect(pollOnce(bot, undefined, async () => {})).rejects.toThrow(/409/)
  })
})

describe('pollOnce и здоровье', () => {
  it('«связь есть» отмечается по ответу getUpdates, до обработчиков и даже если они падают', async () => {
    const order: string[] = []
    const bot = botWith([{ update_id: 1 }])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await pollOnce(
      bot,
      undefined,
      async () => {
        order.push('handle')
        throw new Error('boom')
      },
      () => order.push('fetched'),
    )
    spy.mockRestore()
    expect(order).toEqual(['fetched', 'handle'])
  })
})

describe('здоровье опроса', () => {
  it('без запущенного опроса (вебхук или бот выключен) — всегда здоров', () => {
    resetLoginPollerHealth()
    expect(getLoginPollerHealth(1_000_000).healthy).toBe(true)
  })

  it('после старта здоров, пока есть удачный опрос свежее порога', () => {
    resetLoginPollerHealth()
    markPollerStarted(0)
    expect(getLoginPollerHealth(60_000).healthy).toBe(true)
    markPollerOk(100_000)
    expect(getLoginPollerHealth(180_000).healthy).toBe(true)
  })

  it('без единого удачного опроса дольше порога — нездоров', () => {
    resetLoginPollerHealth()
    markPollerStarted(0)
    const h = getLoginPollerHealth(120_000)
    expect(h.healthy).toBe(false)
    expect(h.lastOkAt).toBeNull()
  })

  it('удачный опрос возвращает здоровье', () => {
    resetLoginPollerHealth()
    markPollerStarted(0)
    expect(getLoginPollerHealth(500_000).healthy).toBe(false)
    markPollerOk(500_000)
    expect(getLoginPollerHealth(501_000).healthy).toBe(true)
  })
})
