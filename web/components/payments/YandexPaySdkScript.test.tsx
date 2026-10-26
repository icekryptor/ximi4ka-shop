import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с теми же атрибутами.
vi.mock('next/script', () => ({
  default: ({ id, src, strategy }: { id?: string; src?: string; strategy?: string }) => (
    <script data-testid={id} data-src={src} data-strategy={strategy} />
  ),
}))

import { YANDEX_PAY_SDK_URL, YandexPaySdkScript } from './YandexPaySdkScript'

describe('YandexPaySdkScript', () => {
  it('pay.js Яндекса — lazyOnload, с одним id на страницу', () => {
    render(<YandexPaySdkScript />)
    const script = screen.getByTestId('yandex-pay-sdk')
    expect(script).toHaveAttribute('data-src', YANDEX_PAY_SDK_URL)
    expect(script).toHaveAttribute('data-src', 'https://pay.yandex.ru/sdk/v1/pay.js')
    expect(script).toHaveAttribute('data-strategy', 'lazyOnload')
  })
})
