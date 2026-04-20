import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ParagraphBlock } from '@ximi4ka-shop/shared'
import { ParagraphBlockEditor } from './ParagraphBlockEditor'

describe('ParagraphBlockEditor', () => {
  it('wraps RichTextEditor and forwards html via onChange', async () => {
    const onChange = vi.fn<(b: ParagraphBlock) => void>()
    const { container } = render(
      <ParagraphBlockEditor
        block={{ type: 'paragraph', html: '<p>a</p>' }}
        onChange={onChange}
      />,
    )
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })
    // Toggling bullet list forces a doc update → onChange fires.
    fireEvent.click(screen.getByTitle('Список'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.type).toBe('paragraph')
    expect(typeof next?.html).toBe('string')
    expect(next?.html).toContain('<ul>')
  })
})
