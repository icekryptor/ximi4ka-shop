/**
 * Как грузить картинку карточки. `next/image` по умолчанию ленив
 * (`loading="lazy"`); для картинок первого экрана это вредно: браузер
 * откладывает загрузку до раскладки, и самая большая картинка (LCP)
 * появляется поздно. Lighthouse помечает это аудитом `lcp-lazy-loaded`.
 *
 * - `lazy`     — по умолчанию, всё, что ниже первого экрана;
 * - `eager`    — виден в первом экране, но не главный кадр: без lazy;
 * - `priority` — главный кадр страницы (кандидат в LCP): без lazy и
 *   с `fetchPriority="high"`. Проп `preload` не нужен: React 19 сам кладёт
 *   в head `<link rel="preload" as="image">` (со srcset и sizes) для первых
 *   не-ленивых `<img>`, а у сетки на разных ширинах первой бывает разная
 *   картинка, так что явный preload мог бы грузить лишнее.
 */
export type ImageLoading = 'lazy' | 'eager' | 'priority'

export function firstScreenImageLoading(index: number, eagerCount: number): ImageLoading {
  if (index >= eagerCount) return 'lazy'
  return index === 0 ? 'priority' : 'eager'
}

export function imageLoadingProps(mode: ImageLoading): {
  loading?: 'eager'
  fetchPriority?: 'high'
} {
  if (mode === 'priority') return { loading: 'eager', fetchPriority: 'high' }
  if (mode === 'eager') return { loading: 'eager' }
  return {}
}

// Сколько первых карточек сетки считаем видимыми в первом экране. Компактная
// сетка — 2 колонки на мобиле, 2 ряда. Наборы — 1 колонка с крупным фото, но
// на планшете и десктопе первый ряд — до 3–4 карточек.
export const FIRST_SCREEN_COMPACT_CARDS = 4
export const FIRST_SCREEN_KIT_CARDS = 3

/** Загрузка фото i-й карточки сетки, которая начинается в первом экране. */
export function firstScreenCardLoading(density: 'kit' | 'compact', index: number): ImageLoading {
  return firstScreenImageLoading(
    index,
    density === 'compact' ? FIRST_SCREEN_COMPACT_CARDS : FIRST_SCREEN_KIT_CARDS,
  )
}
