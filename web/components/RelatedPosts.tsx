import type { BlogPost } from '@ximi4ka-shop/shared'
import { BlogPostCard } from '@/components/BlogPostCard'
import { LabSection } from '@/components/ui/LabSection'

interface Props {
  posts: BlogPost[]
}

/** «Похожие статьи» в конце статьи: внутренняя перелинковка блога. */
export function RelatedPosts({ posts }: Props) {
  if (posts.length === 0) return null
  return (
    <LabSection variant="cream" className="px-6 pb-20">
      <div className="max-w-[var(--max-lj-content)] mx-auto">
        <h2 className="font-lj-display font-[700] text-[clamp(1.5rem,2.5vw,2.25rem)] leading-[1.05] tracking-[-0.035em] mb-8">
          Похожие статьи
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {posts.map((post) => (
            <BlogPostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </LabSection>
  )
}
