import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Block } from '@ximi4ka-shop/shared'
import { BlockEditor } from './BlockEditor'

describe('BlockEditor', () => {
  it('shows empty state when no blocks', () => {
    render(<BlockEditor value={[]} onChange={() => undefined} />)
    expect(screen.getByText(/Блоков пока нет/i)).toBeInTheDocument()
  })

  it('opens the add menu and adds a paragraph block', () => {
    const onChange = vi.fn<(blocks: Block[]) => void>()
    render(<BlockEditor value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /добавить блок/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Абзац' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const [blocks] = onChange.mock.calls[0]
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'paragraph' })
  })

  it('removes a block via the ✕ button', () => {
    const onChange = vi.fn<(blocks: Block[]) => void>()
    const initial: Block[] = [
      { type: 'cta', heading: 'A', subtext: null, buttonLabel: 'X', buttonHref: '#' },
      { type: 'cta', heading: 'B', subtext: null, buttonLabel: 'X', buttonHref: '#' },
    ]
    render(<BlockEditor value={initial} onChange={onChange} />)
    const cards = screen.getAllByText('CTA').map((el) => el.closest('[data-block-card]') as HTMLElement)
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Удалить блок' }))
    expect(onChange).toHaveBeenCalled()
    const [blocks] = onChange.mock.calls[0]
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { heading: string }).heading).toBe('B')
  })

  it('reorders blocks via the down arrow', () => {
    const onChange = vi.fn<(blocks: Block[]) => void>()
    const initial: Block[] = [
      { type: 'cta', heading: 'A', subtext: null, buttonLabel: 'X', buttonHref: '#' },
      { type: 'cta', heading: 'B', subtext: null, buttonLabel: 'X', buttonHref: '#' },
    ]
    render(<BlockEditor value={initial} onChange={onChange} />)
    const cards = screen.getAllByText('CTA').map((el) => el.closest('[data-block-card]') as HTMLElement)
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Переместить вниз' }))
    const [blocks] = onChange.mock.calls[0]
    expect((blocks[0] as { heading: string }).heading).toBe('B')
    expect((blocks[1] as { heading: string }).heading).toBe('A')
  })

  it('disables up arrow for the first block and down arrow for the last', () => {
    const initial: Block[] = [
      { type: 'cta', heading: 'A', subtext: null, buttonLabel: 'X', buttonHref: '#' },
      { type: 'cta', heading: 'B', subtext: null, buttonLabel: 'X', buttonHref: '#' },
    ]
    render(<BlockEditor value={initial} onChange={() => undefined} />)
    const cards = screen.getAllByText('CTA').map((el) => el.closest('[data-block-card]') as HTMLElement)
    expect(within(cards[0]).getByRole('button', { name: 'Переместить вверх' })).toBeDisabled()
    expect(within(cards[1]).getByRole('button', { name: 'Переместить вниз' })).toBeDisabled()
  })

  it('filters invalid entries from value', () => {
    render(
      <BlockEditor
        value={[
          { type: 'cta', heading: 'good', subtext: null, buttonLabel: 'X', buttonHref: '#' },
          { type: 'unknown' } as unknown,
          null,
          42,
        ]}
        onChange={() => undefined}
      />,
    )
    // Only the single good CTA is rendered.
    expect(screen.getAllByText('CTA')).toHaveLength(1)
  })
})
