import type { Block } from '@ximi4ka-shop/shared'

export function blockDefault(type: Block['type']): Block {
  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', html: '<p>Новый абзац</p>' }
    case 'image':
      return { type: 'image', url: '', alt: '', caption: null }
    case 'gallery':
      return { type: 'gallery', images: [] }
    case 'layout':
      return {
        type: 'layout',
        variant: 'text-left',
        text: { html: '<p>Текст</p>' },
        image: { url: '', alt: '' },
      }
    case 'cta':
      return {
        type: 'cta',
        heading: 'Заголовок',
        subtext: null,
        buttonLabel: 'Кнопка',
        buttonHref: '#',
      }
    case 'video':
      return { type: 'video', provider: 'youtube', videoId: '', title: null }
    case 'faq':
      return { type: 'faq', items: [{ question: '', answer: '' }] }
    case 'product_grid':
      return { type: 'product_grid', productSlugs: [], heading: null }
  }
}
