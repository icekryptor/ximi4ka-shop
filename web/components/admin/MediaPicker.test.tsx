import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MediaPicker } from './MediaPicker'

function listResponse(items: Array<Partial<{ id: string; url: string; filename: string; mimeType: string; size: number; width: number | null; height: number | null; uploadedBy: string | null; createdAt: string }>>, total?: number) {
  const data = items.map((i, idx) => ({
    id: i.id ?? `m${idx}`,
    url: i.url ?? `/uploads/2026/04/img${idx}.jpg`,
    filename: i.filename ?? `img${idx}.jpg`,
    mimeType: i.mimeType ?? 'image/jpeg',
    size: i.size ?? 1234,
    width: i.width ?? 640,
    height: i.height ?? 480,
    uploadedBy: i.uploadedBy ?? null,
    createdAt: i.createdAt ?? '2026-04-01T00:00:00Z',
  }))
  return new Response(
    JSON.stringify({
      data,
      pagination: { limit: 40, offset: 0, total: total ?? data.length },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('MediaPicker', () => {
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

  it('does not render when open=false', () => {
    render(
      <MediaPicker open={false} onClose={() => undefined} onPick={() => undefined} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and renders grid when opened', async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([{ id: 'a', filename: 'alpha.jpg' }, { id: 'b', filename: 'beta.jpg' }]),
    )
    render(
      <MediaPicker open onClose={() => undefined} onPick={() => undefined} />,
    )
    await waitFor(() => {
      expect(screen.getByText('alpha.jpg')).toBeInTheDocument()
    })
    expect(screen.getByText('beta.jpg')).toBeInTheDocument()
    // Default mimePrefix=image/ forwarded.
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/admin/media')
    expect(url).toContain('mimePrefix=image')
  })

  it('calls onPick with url and then onClose when a card is clicked', async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([
        { id: 'a', url: '/uploads/2026/04/alpha.jpg', filename: 'alpha.jpg' },
      ]),
    )
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<MediaPicker open onClose={onClose} onPick={onPick} />)
    await waitFor(() => {
      expect(screen.getByText('alpha.jpg')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('alpha.jpg'))
    expect(onPick).toHaveBeenCalledWith('/uploads/2026/04/alpha.jpg')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the cancel button is clicked', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]))
    const onClose = vi.fn()
    render(<MediaPicker open onClose={onClose} onPick={() => undefined} />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    fireEvent.click(screen.getByText('Отмена'))
    expect(onClose).toHaveBeenCalled()
  })
})
