import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RichTextEditor } from './RichTextEditor'

// These tests target the component integration seams (props plumbing,
// toolbar wiring, sanitization pipeline) rather than ProseMirror/Tiptap
// internals. Tiptap itself has its own test suite upstream.

describe('RichTextEditor', () => {
  it('renders toolbar with all action buttons', async () => {
    render(
      <RichTextEditor value="<p>Hello</p>" onChange={() => undefined} />,
    )
    // Editor mounts asynchronously after immediatelyRender:false.
    await waitFor(() => {
      expect(screen.getByTitle('Жирный')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Курсив')).toBeInTheDocument()
    expect(screen.getByTitle('Подчёркнутый')).toBeInTheDocument()
    expect(screen.getByTitle('Зачёркнутый')).toBeInTheDocument()
    expect(screen.getByTitle('Заголовок 2')).toBeInTheDocument()
    expect(screen.getByTitle('Заголовок 3')).toBeInTheDocument()
    expect(screen.getByTitle('Список')).toBeInTheDocument()
    expect(screen.getByTitle('Нумерованный список')).toBeInTheDocument()
    expect(screen.getByTitle('Цитата')).toBeInTheDocument()
    expect(screen.getByTitle('Ссылка')).toBeInTheDocument()
    expect(screen.getByTitle('Отменить')).toBeInTheDocument()
    expect(screen.getByTitle('Повторить')).toBeInTheDocument()
  })

  it('renders initial value as HTML in the editable area', async () => {
    const { container } = render(
      <RichTextEditor
        value="<p>Начальный текст</p>"
        onChange={() => undefined}
      />,
    )
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })
    const editable = container.querySelector('.ProseMirror') as HTMLElement
    expect(editable.textContent).toContain('Начальный текст')
  })

  it('fires onChange with sanitized HTML when toolbar action changes the doc', async () => {
    const onChange = vi.fn<(html: string) => void>()
    const { container } = render(
      <RichTextEditor value="<p>a</p>" onChange={onChange} />,
    )
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })

    // Toggling a bullet list wraps the existing paragraph in <ul><li>...</li></ul>,
    // which always produces a document change (unlike toggling a mark on an
    // empty cursor selection, which ProseMirror can no-op).
    fireEvent.click(screen.getByTitle('Список'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })

    // Every emitted HTML should round-trip through the sanitizer.
    const latest = onChange.mock.calls.at(-1)?.[0] as string
    expect(typeof latest).toBe('string')
    expect(latest).not.toMatch(/<script/i)
    expect(latest).toContain('<ul>')
  })

  it('strips script tags via sanitizer when HTML is set programmatically', async () => {
    // When a parent pushes dirty HTML into the editor it's rendered into
    // ProseMirror which already strips unknown/unsafe tags. Verify the
    // visible content never contains "alert(1)" or a <script> element.
    const onChange = vi.fn<(html: string) => void>()
    const { container, rerender } = render(
      <RichTextEditor value="<p>clean</p>" onChange={onChange} />,
    )
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })
    rerender(
      <RichTextEditor
        value='<p>before</p><script>alert(1)</script><p>after</p>'
        onChange={onChange}
      />,
    )
    await waitFor(() => {
      const editable = container.querySelector('.ProseMirror') as HTMLElement
      expect(editable.textContent).toContain('before')
      expect(editable.textContent).toContain('after')
    })
    const editable = container.querySelector('.ProseMirror') as HTMLElement
    expect(editable.querySelector('script')).toBeNull()
    expect(editable.textContent).not.toContain('alert(1)')
  })

  it('mirrors external value changes into the editor', async () => {
    const onChange = vi.fn<(html: string) => void>()
    const { container, rerender } = render(
      <RichTextEditor value="<p>one</p>" onChange={onChange} />,
    )
    await waitFor(() => {
      const editable = container.querySelector('.ProseMirror') as HTMLElement
      expect(editable.textContent).toContain('one')
    })
    rerender(<RichTextEditor value="<p>two</p>" onChange={onChange} />)
    await waitFor(() => {
      const editable = container.querySelector('.ProseMirror') as HTMLElement
      expect(editable.textContent).toContain('two')
    })
  })

  it('opens a URL prompt when the link button is clicked', async () => {
    const onChange = vi.fn<(html: string) => void>()
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockImplementation(() => 'https://example.com')
    render(<RichTextEditor value="<p>text</p>" onChange={onChange} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ссылка')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('Ссылка'))
    expect(promptSpy).toHaveBeenCalled()
    promptSpy.mockRestore()
  })
})
