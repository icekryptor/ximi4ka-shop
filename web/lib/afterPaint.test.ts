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
})
