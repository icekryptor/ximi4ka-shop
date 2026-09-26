interface Props {
  /** Крупный оффер (белым по градиенту). */
  headline: string
  /** Подстрочник — вспомогательный текст. */
  sub?: string
  /** Моно-эйбрау над заголовком. */
  eyebrow?: string
}

/**
 * Яркий градиентный промо-баннер витрины каталога (макет «Каталог — 1440»):
 * крупное скругление, заголовок Mazzard Light Italic 48/47, лёгкая тень, без
 * декора. Ink-текст на градиенте запрещён — только белый.
 */
export function CatalogPromoBanner({ headline, sub, eyebrow }: Props) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] px-7 py-10 sm:px-12 sm:py-14">
      <div className="relative max-w-[572px]">
        {eyebrow && (
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.04em] text-[var(--color-lj-on-bright-mute)] mb-4">
            {eyebrow}
          </p>
        )}
        <h2 className="font-lj-mazzard font-light italic text-[clamp(2rem,4vw,3rem)] leading-[0.98] tracking-[-0.035em] text-[var(--color-lj-on-bright)]">
          {headline}
        </h2>
        {sub && (
          <p className="mt-4 max-w-[460px] text-[0.9375rem] sm:text-base leading-[1.5] text-[var(--color-lj-on-bright-mute)]">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}
