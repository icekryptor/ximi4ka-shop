import type { BlogPost } from '@ximi4ka-shop/shared'

/** Сколько «похожих статей» показываем под статьёй. */
export const RELATED_POSTS_LIMIT = 3

function publishedTime(post: BlogPost): number {
  return new Date(post.publishedAt ?? post.createdAt).getTime()
}

/**
 * Похожие статьи: сначала той же рубрики, остальное добирается самыми
 * свежими. Текущая статья, черновики и noindex-статьи не попадают (noindex
 * в блоке ссылок бессмыслен: страницу не покажет поиск). Внутри группы —
 * от новых к старым.
 */
export function pickRelatedPosts(
  current: BlogPost,
  candidates: BlogPost[],
  limit: number = RELATED_POSTS_LIMIT,
): BlogPost[] {
  const eligible = candidates
    .filter((p) => p.id !== current.id && p.slug !== current.slug && p.isPublished && !p.noindex)
    .sort((a, b) => publishedTime(b) - publishedTime(a))

  const sameRubric = current.rubric ? eligible.filter((p) => p.rubric === current.rubric) : []
  const rest = eligible.filter((p) => !sameRubric.includes(p))
  return [...sameRubric, ...rest].slice(0, limit)
}
