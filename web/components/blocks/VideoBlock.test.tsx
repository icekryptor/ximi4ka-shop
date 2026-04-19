import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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

describe('VideoBlock', () => {
  it('renders an iframe with the YouTube embed src', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'youtube', videoId: 'abc' }} />,
    )
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/abc')
  })

  it('renders a figcaption and iframe title when title is provided', () => {
    const { container } = render(
      <VideoBlock
        block={{ type: 'video', provider: 'rutube', videoId: 'abc', title: 'Название' }}
      />,
    )
    expect(container.querySelector('figcaption')?.textContent).toBe('Название')
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Название')
  })

  it('uses a default Russian title when none is provided', () => {
    const { container } = render(
      <VideoBlock block={{ type: 'video', provider: 'vk', videoId: 'oid=-1&id=1' }} />,
    )
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Видео')
    expect(container.querySelector('figcaption')).toBeNull()
  })
})
