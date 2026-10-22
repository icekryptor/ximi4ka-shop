import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./fonts', () => ({ fontVariables: '' }))
// next/script в SSR-рендере теста — <script> с тем же телом и адресом в data-src
// (настоящий src линтер принял бы за синхронный скрипт): так в разметке видно,
// какие внешние скрипты подключает layout.
vi.mock('next/script', () => ({
  default: ({ id, src, children }: { id?: string; src?: string; children?: string }) => (
    <script id={id} data-src={src}>
      {children}
    </script>
  ),
}))
// Счётчики подменены метками; всё остальное из модуля — настоящее, чтобы
// проверка «GTM не подключён» не зависела от списка моков.
vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  MetrikaScript: () => null,
  VarioqubScript: ({ counterId }: { counterId: string }) => <i data-varioqub={counterId} />,
  Ga4Script: () => null,
  VkPixelScript: () => <i data-vk-pixel />,
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

  it('mounts Varioqub on the Metrika counter from settings, and not without one', async () => {
    const settings = {
      yandexWebmasterVerification: null,
      googleSiteVerification: null,
      ga4Id: null,
    }
    vi.mocked(getPublicSettings).mockResolvedValue({
      ...settings,
      metrikaId: '12345',
    } as unknown as PublicSettings)
    expect(await renderHtml()).toContain('data-varioqub="12345"')

    vi.mocked(getPublicSettings).mockResolvedValue({
      ...settings,
      metrikaId: null,
    } as unknown as PublicSettings)
    expect(await renderHtml()).not.toContain('data-varioqub')

    vi.mocked(getPublicSettings).mockRejectedValue(new Error('api down'))
    expect(await renderHtml()).not.toContain('data-varioqub')
  })

  it('mounts the VK pixel even when settings are unavailable', async () => {
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('api down'))
    expect(await renderHtml()).toContain('data-vk-pixel')
  })

  // GTM снят 23.10.2026: контейнер был пуст, а gtm.js стоил ~100 мс главного потока.
  it('does not load Google Tag Manager (gtm.js, ns.html)', async () => {
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('api down'))
    const html = await renderHtml()
    expect(html).not.toContain('googletagmanager.com/gtm.js')
    expect(html).not.toContain('googletagmanager.com/ns.html')
  })
})
