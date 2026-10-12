import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { METHODICHKI } from '@ximi4ka-shop/shared'
import { MethodichkiDownloads } from './MethodichkiDownloads'

afterEach(cleanup)

describe('<MethodichkiDownloads>', () => {
  it('renders nothing when there are no methodichki', () => {
    const { container } = render(<MethodichkiDownloads items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a download link per methodichka', () => {
    render(<MethodichkiDownloads items={[METHODICHKI.himichka, METHODICHKI.oge]} />)
    expect(screen.getByTestId('methodichki')).toHaveTextContent('Ваши электронные методички')
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/methodichki/himichka.pdf',
      '/methodichki/oge-2026.pdf',
    ])
    for (const a of links) expect(a).toHaveAttribute('download')
    expect(links[0]).toHaveTextContent('Методичка «Химичка 3.0 / Мини-Химичка»')
  })
})
