import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CsvImportDialog } from './CsvImportDialog'

// Mock next/navigation's useRouter — refresh() is called on close and the
// component otherwise imports nothing router-side.
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}))

describe('CsvImportDialog', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const origFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch
    document.cookie = 'ximi4ka_shop_csrf=csrf-token-123'
    fetchMock.mockReset()
    refreshMock.mockReset()
  })

  afterEach(() => {
    global.fetch = origFetch
    document.cookie = 'ximi4ka_shop_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('renders nothing when open=false', () => {
    const { container } = render(
      <CsvImportDialog open={false} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the upload zone when open', () => {
    render(<CsvImportDialog open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Выберите CSV-файл/)).toBeInTheDocument()
  })

  it('uploads file and shows summary on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            inserted: 2,
            updated: 1,
            skipped: 1,
            errors: [{ row: 3, message: 'bad row' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    render(<CsvImportDialog open={true} onClose={() => {}} />)
    const file = new File(['from_path,to_path\n/a,/b\n'], 'r.csv', {
      type: 'text/csv',
    })
    const input = screen.getByLabelText(/Выберите CSV-файл/) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Добавлено')).toBeInTheDocument()
    })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1', { selector: '.text-brand' })).toBeInTheDocument()
    expect(screen.getByText(/Ошибки \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Строка 3: bad row/)).toBeInTheDocument()
  })

  it('shows error message when upload fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'empty_csv', message: 'CSV is empty' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    )
    render(<CsvImportDialog open={true} onClose={() => {}} />)
    const file = new File([''], 'empty.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Выберите CSV-файл/) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('CSV is empty')
    })
  })

  it('close button calls onClose and router.refresh', () => {
    const onClose = vi.fn()
    render(<CsvImportDialog open={true} onClose={onClose} />)
    // Two elements both labelled "Закрыть": the ✕ in the header (aria-label)
    // and the explicit bottom button. Either works — pick the last one
    // since it's the user-facing primary action.
    const closeButtons = screen.getAllByRole('button', { name: 'Закрыть' })
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })
})
