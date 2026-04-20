import type { Block } from '@ximi4ka-shop/shared'

export const blockLabels: Record<Block['type'], string> = {
  paragraph: 'Абзац',
  image: 'Картинка',
  gallery: 'Галерея',
  layout: 'Составной блок',
  cta: 'CTA',
  video: 'Видео',
  faq: 'Вопросы и ответы',
  product_grid: 'Подборка товаров',
}

export function blockLabel(type: Block['type']): string {
  return blockLabels[type]
}
