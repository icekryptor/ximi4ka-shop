import type { LayoutBlock as LayoutBlockType } from '@ximi4ka-shop/shared'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface Props {
  block: LayoutBlockType
}

/**
 * Two-pane layout: one rich-text pane, one image. Variants control the
 * orientation and the overlay special case. All classes are Tailwind.
 */
export function LayoutBlock({ block }: Props) {
  const safeHtml = sanitizeHtml(block.text.html)

  if (block.variant === 'overlay') {
    return (
      <div
        data-block="layout"
        data-variant="overlay"
        className="relative overflow-hidden rounded-2xl my-4"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.image.url}
          alt={block.image.alt}
          className="w-full h-auto block"
        />
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white p-6 prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </div>
    )
  }

  const variantClasses: Record<Exclude<LayoutBlockType['variant'], 'overlay'>, string> = {
    'text-left': 'md:grid-cols-2',
    'text-right': 'md:grid-cols-2',
    'text-top': 'grid-cols-1',
    'text-bottom': 'grid-cols-1',
  }

  const textFirst =
    block.variant === 'text-left' || block.variant === 'text-top'

  return (
    <div
      data-block="layout"
      data-variant={block.variant}
      className={`grid gap-6 my-4 ${variantClasses[block.variant]}`}
    >
      {textFirst ? (
        <>
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.image.url}
            alt={block.image.alt}
            className="w-full h-auto rounded-2xl"
          />
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.image.url}
            alt={block.image.alt}
            className="w-full h-auto rounded-2xl"
          />
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </>
      )}
    </div>
  )
}
