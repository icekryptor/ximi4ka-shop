import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotebookHeader } from './NotebookHeader'

describe('<NotebookHeader>', () => {
  it('renders section index, label, page count, and edition', () => {
    render(
      <NotebookHeader
        section="01"
        label="Лабораторный журнал"
        page={1}
        total={3}
        edition="Ред. 2026.04 / v3"
      />,
    )
    expect(screen.getByText(/01\s*—\s*Лабораторный журнал/i)).toBeInTheDocument()
    expect(screen.getByText('стр. 01 / 03')).toBeInTheDocument()
    expect(screen.getByText('Ред. 2026.04 / v3')).toBeInTheDocument()
  })

  it('zero-pads page numbers to 2 digits', () => {
    render(<NotebookHeader section="02" label="x" page={2} total={10} />)
    expect(screen.getByText('стр. 02 / 10')).toBeInTheDocument()
  })

  it('omits edition when not provided', () => {
    render(<NotebookHeader section="01" label="x" page={1} total={3} />)
    expect(screen.queryByText(/Ред\./)).toBeNull()
  })
})
