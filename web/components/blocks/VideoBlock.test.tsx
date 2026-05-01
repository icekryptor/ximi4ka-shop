import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { VideoBlock, videoEmbedUrl } from './VideoBlock'

afterEach(() => {
  cleanup()
})

describe('videoEmbedUrl', () => {
  it('builds YouTube embed URL', () => {
    expect(videoEmbedUrl('youtube', 'dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('builds VK embed URL with compound id as query suffix', () => {
    expect(videoEmbedUrl('vk', 'oid=-1&id=456')).toBe(
      'https://vk.com/video_ext.php?oid=-1&id=456',
    )
  })

  it('builds Rutube embed URL', () => {
    expect(videoEmbedUrl('rutube', 'abc123')).toBe('https://rutube.ru/play/embed/abc123')
  })
})

describe('<VideoBlock> v3', () => {
  it('renders an iframe inside MediaFrame', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />,
    )
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(container.querySelector('[data-frame]')).not.toBeNull()
  })

  it('renders the iframe with the provider-built embed src', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />,
    )
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/abc',
    )
  })

  it('preserves data-block="video" marker', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />,
    )
    expect(container.querySelector('[data-block="video"]')).not.toBeNull()
  })

  it('uses 16/9 aspect ratio', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />,
    )
    const frame = container.querySelector('[data-frame]') as HTMLElement
    expect(frame.style.aspectRatio).toBe('16 / 9')
  })

  it('renders mono corner mark "arr. vid"', () => {
    render(<VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />)
    expect(screen.getByText(/arr\. vid/i)).toBeInTheDocument()
  })

  it('renders [data-caption] when title is provided and sets iframe title', () => {
    const { container } = render(
      <VideoBlock
        block={{ type: 'video', provider: 'rutube', videoId: 'abc', title: 'Название' }}
      />,
    )
    const caption = container.querySelector('[data-caption]')
    expect(caption).not.toBeNull()
    expect(caption?.textContent).toContain('Название')
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Название')
  })

  it('uses default Russian iframe title and omits [data-caption] when title missing', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'vk', videoId: 'oid=-1&id=1' }} />,
    )
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Видео')
    expect(container.querySelector('[data-caption]')).toBeNull()
  })

  it('omits [data-caption] when title is null (DB default)', () => {
    const { container } = render(
      <VideoBlock
        block={{ type: 'video', provider: 'youtube', videoId: 'abc', title: null }}
      />,
    )
    expect(container.querySelector('[data-caption]')).toBeNull()
  })
})
