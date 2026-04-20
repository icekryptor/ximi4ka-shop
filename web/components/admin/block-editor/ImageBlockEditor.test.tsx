import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ImageBlock } from '@ximi4ka-shop/shared'
import { ImageBlockEditor } from './ImageBlockEditor'

describe('ImageBlockEditor', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const origFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch
    document.cookie = 'ximi4ka_shop_csrf=csrf-abc'
    fetchMock.mockReset()
  })

  afterEach(() => {
    global.fetch = origFetch
    document.cookie = 'ximi4ka_shop_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('updates alt via onChange', () => {
    const onChange = vi.fn<(b: ImageBlock) => void>()
    render(
      <ImageBlockEditor
        block={{ type: 'image', url: '', alt: '', caption: null }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Alt-текст'), {
      target: { value: 'описание' },
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ alt: 'описание' }),
    )
  })

  it('uploads an image and fires onChange with url', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            url: '/uploads/2026/04/p.jpg',
            filename: 'p.jpg',
            size: 1,
            mimeType: 'image/jpeg',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const onChange = vi.fn<(b: ImageBlock) => void>()
    const { container } = render(
      <ImageBlockEditor
        block={{ type: 'image', url: '', alt: '', caption: null }}
        onChange={onChange}
      />,
    )
    const file = new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' })
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.url).toBe('/uploads/2026/04/p.jpg')
  })

  it('caption empty string → null', () => {
    const onChange = vi.fn<(b: ImageBlock) => void>()
    render(
      <ImageBlockEditor
        block={{ type: 'image', url: '', alt: '', caption: 'hi' }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Подпись'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ caption: null }),
    )
  })
})
