import Image from 'next/image'
import type { BlogPost } from '@ximi4ka-shop/shared'

export type BlogAuthor = Pick<
  BlogPost,
  'authorName' | 'authorJobTitle' | 'authorBio' | 'authorUrl' | 'authorPhotoUrl'
>

interface Props {
  post: BlogAuthor
}

/**
 * Блок «Об авторе» под статьёй (сигнал экспертности, E-E-A-T). Появляется
 * только при заданном имени — без него у статьи нет автора-человека, и в
 * разметке остаётся Organization. Ссылка на профиль — только http(s).
 */
export function BlogAuthorBox({ post }: Props) {
  const name = post.authorName?.trim()
  if (!name) return null
  const jobTitle = post.authorJobTitle?.trim()
  const bio = post.authorBio?.trim()
  const profileUrl = post.authorUrl?.trim()
  const photo = post.authorPhotoUrl?.trim()

  return (
    <section
      aria-label="Об авторе"
      className="mt-14 border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream-shade)] p-6 md:p-8"
    >
      <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] opacity-60 mb-4">
        Об авторе
      </p>
      <div className="flex flex-col sm:flex-row gap-5">
        {photo && (
          <div className="relative shrink-0 w-20 h-20 overflow-hidden border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)]">
            <Image src={photo} alt={name} fill sizes="80px" className="object-cover" />
          </div>
        )}
        <div>
          <h2 className="font-lj-display font-[700] text-[1.375rem] leading-[1.1] tracking-[-0.03em]">
            {name}
          </h2>
          {jobTitle && (
            <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70 mt-2">
              {jobTitle}
            </p>
          )}
          {bio && <p className="mt-3 text-[0.9375rem] leading-[1.55] max-w-[60ch]">{bio}</p>}
          {profileUrl && /^https?:\/\//i.test(profileUrl) && (
            <a
              href={profileUrl}
              target="_blank"
              rel="author noopener noreferrer"
              className="inline-block mt-4 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] underline underline-offset-4 hover:text-[var(--color-lj-brand-deep)]"
            >
              Профиль автора
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
