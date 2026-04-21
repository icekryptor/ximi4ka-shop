import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsForm } from './SettingsForm'
import type { SiteSettings } from '@/lib/adminApi'

// Mock the admin API so the form tests don't reach out over the network.
// Using a spy-style mock rather than vi.mock with a factory keeps this file's
// imports stable and lets us reset call state between tests.
vi.mock('@/lib/adminApi', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/adminApi')>()
  return {
    ...mod,
    adminUpdateSettings: vi.fn<
      (patch: Parameters<typeof mod.adminUpdateSettings>[0]) => Promise<SiteSettings>
    >(),
  }
})

import { adminUpdateSettings, ApiError } from '@/lib/adminApi'

const baseSettings: SiteSettings = {
  id: 'default',
  metrikaId: null,
  ga4Id: null,
  robotsTxt: 'User-agent: *\nAllow: /',
  llmsTxt: '',
  yandexWebmasterVerification: null,
  googleSiteVerification: null,
  ymlShopName: null,
  ymlCompany: null,
  ymlUrl: null,
  ymlCurrency: 'RUB',
  ymlDeliveryNote: null,
  yandexPayEnabled: false,
  yandexPayMode: 'sandbox',
  updatedAt: '2026-04-20T00:00:00Z',
}

describe('SettingsForm', () => {
  beforeEach(() => {
    vi.mocked(adminUpdateSettings).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all four sections with initial values', () => {
    render(
      <SettingsForm
        initial={{
          ...baseSettings,
          metrikaId: '123',
          ga4Id: 'G-XYZ',
          ymlUrl: 'https://ximi4ka.example',
        }}
      />,
    )
    expect(screen.getByLabelText(/Яндекс\.Метрика/)).toHaveValue('123')
    expect(screen.getByLabelText(/Google Analytics 4/)).toHaveValue('G-XYZ')
    expect(screen.getByLabelText(/^robots\.txt$/)).toHaveValue(
      'User-agent: *\nAllow: /',
    )
    expect(screen.getByLabelText(/URL магазина/)).toHaveValue(
      'https://ximi4ka.example',
    )
    // Toggle state from initial
    expect(screen.getByLabelText(/Включить Яндекс\.Pay/)).not.toBeChecked()
  })

  it('submits a PATCH with blank fields converted to null', async () => {
    vi.mocked(adminUpdateSettings).mockResolvedValueOnce({
      ...baseSettings,
      metrikaId: '99999',
    })
    render(<SettingsForm initial={baseSettings} />)

    fireEvent.change(screen.getByLabelText(/Яндекс\.Метрика/), {
      target: { value: '99999' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))

    await waitFor(() => {
      expect(adminUpdateSettings).toHaveBeenCalledTimes(1)
    })
    const arg = vi.mocked(adminUpdateSettings).mock.calls[0][0]
    expect(arg.metrikaId).toBe('99999')
    // Unset string fields round-trip as null (not empty string).
    expect(arg.ga4Id).toBeNull()
    expect(arg.ymlUrl).toBeNull()
    // Boolean + enum pass through untouched.
    expect(arg.yandexPayEnabled).toBe(false)
    expect(arg.yandexPayMode).toBe('sandbox')
  })

  it('shows "Сохранено ✓" after a successful save', async () => {
    vi.mocked(adminUpdateSettings).mockResolvedValueOnce(baseSettings)
    render(<SettingsForm initial={baseSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))
    await waitFor(() => {
      expect(screen.getByTestId('saved-indicator')).toHaveTextContent(
        /Сохранено/,
      )
    })
  })

  it('rejects an invalid YML URL client-side without calling the API', async () => {
    render(<SettingsForm initial={baseSettings} />)
    const urlInput = screen.getByLabelText(/URL магазина/) as HTMLInputElement
    // Swap to `type="text"` so the browser-native `url` constraint doesn't
    // block submission before our handler runs.
    urlInput.setAttribute('type', 'text')
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } })
    // Dispatch submit on the form directly rather than clicking the button —
    // jsdom is flaky about implicit submission on button click, and submit is
    // what the handler actually listens for.
    const form = screen.getByRole('form', { name: /Настройки сайта/ })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /URL для YML должен быть корректным/,
      )
    })
    expect(adminUpdateSettings).not.toHaveBeenCalled()
  })

  it('renders a server error message when the API fails', async () => {
    vi.mocked(adminUpdateSettings).mockRejectedValueOnce(
      new ApiError(400, 'validation_error', 'bad input'),
    )
    render(<SettingsForm initial={baseSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('bad input')
    })
  })
})
