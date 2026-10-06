import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./fonts', () => ({ fontVariables: '' }))
vi.mock('@/lib/analytics', () => ({
  MetrikaScript: () => null,
  Ga4Script: () => null,
}))
vi.mock('@/lib/api', () => ({
  getPublicSettings: vi.fn(),
}))

import RootLayout from './layout'
import { getPublicSettings, type PublicSettings } from '@/lib/api'

const MERCHANTS_VERIFICATION = '02c1ec697bf7da58'

async function renderHtml(): Promise<string> {
  return renderToStaticMarkup(await RootLayout({ children: null }))
}

describe('RootLayout verification tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits the Yandex Merchants verification tag even when settings are unavailable', async () => {
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('api down'))
    const html = await renderHtml()
    expect(html).toContain(`<meta name="yandex-verification" content="${MERCHANTS_VERIFICATION}"/>`)
  })

  it('emits the Webmaster tag from settings alongside the Merchants tag', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({
      yandexWebmasterVerification: 'webmaster-code',
      googleSiteVerification: null,
      metrikaId: null,
      ga4Id: null,
    } as unknown as PublicSettings)
    const html = await renderHtml()
    expect(html).toContain(`content="${MERCHANTS_VERIFICATION}"`)
    expect(html).toContain('<meta name="yandex-verification" content="webmaster-code"/>')
  })
})
