import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageUploadField } from './ImageUploadField'

describe('ImageUploadField', () => {
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

  it('renders empty state with "Выбрать файл" button', () => {
    render(<ImageUploadField value={null} onChange={() => undefined} />)
    expect(screen.getByText(/Выбрать файл/i)).toBeInTheDocument()
    expect(screen.getByText(/Нет файла/i)).toBeInTheDocument()
  })

  it('uploads a selected file and calls onChange with returned url', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            url: '/uploads/2026/04/y.jpg',
            filename: 'y.jpg',
            size: 1,
            mimeType: 'image/jpeg',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const onChange = vi.fn()
    const { container } = render(
      <ImageUploadField value={null} onChange={onChange} />,
    )
    const file = new File([new Uint8Array([1])], 'y.jpg', {
      type: 'image/jpeg',
    })
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/uploads/2026/04/y.jpg')
    })
  })

  it('clicking "Удалить" clears the value', () => {
    const onChange = vi.fn()
    render(
      <ImageUploadField value="/uploads/2026/04/x.jpg" onChange={onChange} />,
    )
    fireEvent.click(screen.getByText(/Удалить/))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
