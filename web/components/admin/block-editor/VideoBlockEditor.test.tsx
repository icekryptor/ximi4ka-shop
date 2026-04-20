import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VideoBlock } from '@ximi4ka-shop/shared'
import { VideoBlockEditor } from './VideoBlockEditor'

describe('VideoBlockEditor', () => {
  it('switches provider', () => {
    const onChange = vi.fn<(b: VideoBlock) => void>()
    render(
      <VideoBlockEditor
        block={{ type: 'video', provider: 'youtube', videoId: 'abc', title: null }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Провайдер'), {
      target: { value: 'rutube' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'rutube' }),
    )
  })

  it('updates videoId', () => {
    const onChange = vi.fn<(b: VideoBlock) => void>()
    render(
      <VideoBlockEditor
        block={{ type: 'video', provider: 'youtube', videoId: '', title: null }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('ID видео'), {
      target: { value: 'dQw4w9WgXcQ' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ videoId: 'dQw4w9WgXcQ' }),
    )
  })
})
