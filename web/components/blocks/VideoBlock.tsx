import type { VideoBlock as VideoBlockType, VideoProvider } from '@ximi4ka-shop/shared'
import { MediaFrame } from '@/components/ui/MediaFrame'

interface Props {
  block: VideoBlockType
}

/**
 * Provider-specific embed URL builder. Preserved from v2:
 * - YouTube and Rutube use a bare video id
 * - VK uses a compound oid/id pair as a raw query string suffix
 *   (callers pass the full string after `video_ext.php?`,
 *   e.g. "oid=-1&id=456").
 */
export function videoEmbedUrl(provider: VideoProvider, videoId: string): string {
  switch (provider) {
    case 'youtube':
      return `https://www.youtube.com/embed/${videoId}`
    case 'vk':
      return `https://vk.com/video_ext.php?${videoId}`
    case 'rutube':
      return `https://rutube.ru/play/embed/${videoId}`
  }
}

/**
 * Renders a CMS video block via the v3 lab-journal MediaFrame primitive
 * (cream-shade backdrop, ink rule border, mono "arr. vid" corner mark,
 * optional caption beneath). Uses 16/9 aspect ratio, vs 4/5 for ImageBlock,
 * because video sources are landscape by default.
 *
 * The shared VideoBlock type carries provider + videoId; we pipe `block.title`
 * into both the iframe accessible title and the MediaFrame caption, falling
 * back to "Видео" for a11y when the title is absent.
 */
export function VideoBlock({ block }: Props) {
  const src = videoEmbedUrl(block.provider, block.videoId)
  const title = block.title ?? undefined
  return (
    <div data-block="video">
      <MediaFrame
        cornerMark="arr. vid"
        caption={title}
        aspectRatio="16/9"
        className="max-w-[var(--max-lj-narrow)] mx-auto"
      >
        <iframe
          src={src}
          title={title ?? 'Видео'}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </MediaFrame>
    </div>
  )
}
