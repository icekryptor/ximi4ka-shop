import type { VideoBlock as VideoBlockType, VideoProvider } from '@ximi4ka-shop/shared'

interface Props {
  block: VideoBlockType
}

export function videoEmbedUrl(provider: VideoProvider, videoId: string): string {
  switch (provider) {
    case 'youtube':
      return `https://www.youtube.com/embed/${videoId}`
    case 'vk':
      // VK's player uses a compound oid/id pair; callers should pass the
      // full query string after video_ext.php? (e.g. "oid=-1&id=456").
      return `https://vk.com/video_ext.php?${videoId}`
    case 'rutube':
      return `https://rutube.ru/play/embed/${videoId}`
  }
}

export function VideoBlock({ block }: Props) {
  const src = videoEmbedUrl(block.provider, block.videoId)
  return (
    <figure data-block="video" className="my-4">
      <div className="relative w-full aspect-video overflow-hidden rounded-2xl bg-black">
        <iframe
          src={src}
          title={block.title ?? 'Видео'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
      {block.title ? (
        <figcaption className="mt-2 text-sm text-gray-500 text-center">
          {block.title}
        </figcaption>
      ) : null}
    </figure>
  )
}
