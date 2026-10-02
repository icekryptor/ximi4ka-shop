import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'

const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: () => headersMock() }))
vi.mock('@/lib/api', () => ({ getPublicSettings: vi.fn().mockRejectedValue(new Error('down')) }))
vi.mock('./fonts', () => ({ fontVariables: 'font-vars' }))

import RootLayout from './layout'

async function htmlLang(locale: string | null): Promise<string | undefined> {
  headersMock.mockResolvedValue(new Headers(locale == null ? {} : { 'x-locale': locale }))
  const el = (await RootLayout({ children: null })) as ReactElement<{ lang?: string }>
  return el.props.lang
}

describe('RootLayout <html lang>', () => {
  beforeEach(() => headersMock.mockReset())

  it('uses the locale passed by middleware', async () => {
    expect(await htmlLang('en')).toBe('en')
    expect(await htmlLang('ru')).toBe('ru')
  })

  it('falls back to ru without the header (admin, amp, feeds, not-found)', async () => {
    expect(await htmlLang(null)).toBe('ru')
  })

  it('ignores an unsupported locale value', async () => {
    expect(await htmlLang('de')).toBe('ru')
  })
})
