import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ getPublicSettings: vi.fn() }))
vi.mock('@/lib/api', () => api)

import { resetCoinsProgramCache, useCoinsProgram } from './useCoinsProgram'

beforeEach(() => {
  resetCoinsProgramCache()
  api.getPublicSettings.mockReset()
  document.cookie = 'ximi4ka_customer_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('useCoinsProgram', () => {
  it('program off: percent stays null', async () => {
    const settled = Promise.resolve({ coins: null })
    api.getPublicSettings.mockReturnValue(settled)
    const { result } = renderHook(() => useCoinsProgram())
    await act(async () => {
      await settled
    })
    expect(result.current.percent).toBeNull()
  })

  it('reads the percent and a guest hint', async () => {
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    const { result } = renderHook(() => useCoinsProgram())
    expect(result.current).toEqual({ percent: null, signedIn: false })
    await waitFor(() => expect(result.current.percent).toBe(5))
    expect(result.current.signedIn).toBe(false)
  })

  it('takes signedIn from the CSRF cookie hint', async () => {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    const { result } = renderHook(() => useCoinsProgram())
    await waitFor(() => expect(result.current.percent).toBe(5))
    expect(result.current.signedIn).toBe(true)
  })

  it('shares one request between consumers', async () => {
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    const a = renderHook(() => useCoinsProgram())
    const b = renderHook(() => useCoinsProgram())
    await waitFor(() => expect(a.result.current.percent).toBe(5))
    await waitFor(() => expect(b.result.current.percent).toBe(5))
    expect(api.getPublicSettings).toHaveBeenCalledTimes(1)
  })

  it('api down: no row and a later consumer retries', async () => {
    const failed = Promise.reject(new Error('down'))
    failed.catch(() => {})
    api.getPublicSettings.mockReturnValueOnce(failed)
    const a = renderHook(() => useCoinsProgram())
    await act(async () => {
      await failed.catch(() => {})
    })
    expect(a.result.current.percent).toBeNull()
    api.getPublicSettings.mockResolvedValueOnce({ coins: { cashbackPercent: 5 } })
    const b = renderHook(() => useCoinsProgram())
    await waitFor(() => expect(b.result.current.percent).toBe(5))
  })
})
