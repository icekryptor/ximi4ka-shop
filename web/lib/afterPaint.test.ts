import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { afterNextPaint } from './afterPaint'

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('afterNextPaint', () => {
  it('не вызывает fn синхронно и не вызывает сразу после кадра — только после кадра и таймера', () => {
    const fn = vi.fn()
    afterNextPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersToNextTimer() // requestAnimationFrame
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersToNextTimer() // setTimeout(0) после кадра
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('сохраняет порядок вызовов', () => {
    const calls: string[] = []
    afterNextPaint(() => calls.push('a'))
    afterNextPaint(() => calls.push('b'))
    afterNextPaint(() => calls.push('c'))
    vi.runAllTimers()
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  it('во вкладке в фоне кадров нет — обходится одним таймером', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
    const fn = vi.fn()
    afterNextPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(raf).not.toHaveBeenCalled()
  })

  it('без requestAnimationFrame — обходится одним таймером', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const fn = vi.fn()
    afterNextPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('кадр не пришёл (вкладку скрыли) — событие уходит не позже чем через 100 мс', () => {
    // Скрытая вкладка не рисует кадры: rAF ждал бы возвращения посетителя.
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    const fn = vi.fn()
    afterNextPaint(fn)
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('событие после скрытия вкладки не обгоняет застрявшее раньше', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    const calls: string[] = []
    afterNextPaint(() => calls.push('a')) // вкладка ещё видна, кадр так и не пришёл
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    afterNextPaint(() => calls.push('b')) // уже скрыта — свой таймер на 0 мс
    vi.advanceTimersByTime(0)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(100)
    expect(calls).toEqual(['a', 'b'])
  })

  it('кадр и запасной таймер вместе вызывают fn один раз', () => {
    const fn = vi.fn()
    afterNextPaint(fn)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ошибка в одном событии не теряет следующие', () => {
    const calls: string[] = []
    afterNextPaint(() => {
      throw new Error('сбой аналитики')
    })
    afterNextPaint(() => calls.push('b'))
    // Ошибка всплывает отдельным таймером, как раньше из своего setTimeout.
    expect(() => vi.runAllTimers()).toThrow('сбой аналитики')
    expect(calls).toEqual(['b'])
  })
})
