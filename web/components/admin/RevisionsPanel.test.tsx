import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RevisionsPanel } from './RevisionsPanel'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}))

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('RevisionsPanel', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const origFetch = global.fetch
  const origConfirm = window.confirm

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch
    document.cookie = 'ximi4ka_shop_csrf=csrf-token-123'
    fetchMock.mockReset()
    refreshMock.mockReset()
  })

  afterEach(() => {
    global.fetch = origFetch
    window.confirm = origConfirm
    document.cookie = 'ximi4ka_shop_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('fetches revisions on mount and renders them', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            id: 'rev-1',
            entityType: 'product',
            entityId: 'p1',
            editedAt: '2026-04-19T12:00:00.000Z',
            editedBy: 'admin-1',
            editorEmail: 'alice@example.com',
          },
          {
            id: 'rev-2',
            entityType: 'product',
            entityId: 'p1',
            editedAt: '2026-04-18T09:30:00.000Z',
            editedBy: null,
            editorEmail: null,
          },
        ],
        pagination: { limit: 50, offset: 0, total: 2 },
      }),
    )

    render(<RevisionsPanel entityType="product" entityId="p1" />)

    // Count shows in summary
    await waitFor(() => {
      expect(screen.getByText(/История изменений \(2\)/)).toBeInTheDocument()
    })

    // Editor email populated for one; dash for the null editor.
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)

    // Request hit the correct endpoint.
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/revisions/entity/product/p1')
  })

  it('renders empty state when no revisions', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 50, offset: 0, total: 0 },
      }),
    )

    render(<RevisionsPanel entityType="page" entityId="pg-1" />)

    await waitFor(() => {
      expect(screen.getByText('Пока нет изменений')).toBeInTheDocument()
    })
  })

  it('calls restore API on button click and reloads the list', async () => {
    fetchMock
      // Initial load
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              id: 'rev-abc',
              entityType: 'product',
              entityId: 'p1',
              editedAt: '2026-04-19T12:00:00.000Z',
              editedBy: 'admin-1',
              editorEmail: 'alice@example.com',
            },
          ],
          pagination: { limit: 50, offset: 0, total: 1 },
        }),
      )
      // Restore POST
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { entityType: 'product', entityId: 'p1' } }),
      )
      // Reload after restore
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              id: 'rev-xyz',
              entityType: 'product',
              entityId: 'p1',
              editedAt: '2026-04-19T13:00:00.000Z',
              editedBy: 'admin-1',
              editorEmail: 'alice@example.com',
            },
            {
              id: 'rev-abc',
              entityType: 'product',
              entityId: 'p1',
              editedAt: '2026-04-19T12:00:00.000Z',
              editedBy: 'admin-1',
              editorEmail: 'alice@example.com',
            },
          ],
          pagination: { limit: 50, offset: 0, total: 2 },
        }),
      )

    window.confirm = vi.fn(() => true)
    const onRestored = vi.fn()
    render(
      <RevisionsPanel entityType="product" entityId="p1" onRestored={onRestored} />,
    )

    const btn = await screen.findByRole('button', { name: 'Восстановить' })
    fireEvent.click(btn)

    await waitFor(() => {
      // Expect the restore POST to have fired.
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    const [restoreUrl, restoreInit] = fetchMock.mock.calls[1]
    expect(String(restoreUrl)).toContain('/api/admin/revisions/rev-abc/restore')
    expect(restoreInit?.method).toBe('POST')
    const headers = restoreInit?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')

    // onRestored + router.refresh() invoked.
    expect(onRestored).toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()

    // New count reflected in summary.
    await waitFor(() => {
      expect(screen.getByText(/История изменений \(2\)/)).toBeInTheDocument()
    })
  })

  it('does not call restore when user cancels confirm', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            id: 'rev-abc',
            entityType: 'product',
            entityId: 'p1',
            editedAt: '2026-04-19T12:00:00.000Z',
            editedBy: 'admin-1',
            editorEmail: 'alice@example.com',
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }),
    )
    window.confirm = vi.fn(() => false)

    render(<RevisionsPanel entityType="product" entityId="p1" />)
    const btn = await screen.findByRole('button', { name: 'Восстановить' })
    fireEvent.click(btn)

    // Only the initial GET — no restore, no reload.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows error when list fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, {
        error: { code: 'internal_error', message: 'boom' },
      }),
    )
    render(<RevisionsPanel entityType="product" entityId="p1" />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom')
    })
  })
})
