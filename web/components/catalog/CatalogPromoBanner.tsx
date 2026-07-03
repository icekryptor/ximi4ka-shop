import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'

interface Props {
  /** Крупный оффер (белым по градиенту). */
  headline: string
  /** Подстрочник — вспомогательный текст. */
  sub?: string
  /** Моно-эйбрау над заголовком. */
  eyebrow?: string
}

/**
 * Яркий градиентный промо-баннер витрины каталога (v3.5 §3): крупное
 * скругление, белая типографика Unbounded, декоративная молекула, лёгкая
 * тень. Ink-текст на градиенте запрещён — только белый.
 */
export function CatalogPromoBanner({ headline, sub, eyebrow }: Props) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] px-7 py-10 sm:px-12 sm:py-14">
      <MoleculeMotifLJ
        variant="benzene"
        className="absolute right-[-8%] top-[-20%] w-[40%] max-w-[280px] text-[var(--color-lj-on-bright)] opacity-25 pointer-events-none"
      />
      <div className="relative z-[2] max-w-[46ch]">
        {eyebrow && (
          <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.1em] text-[var(--color-lj-on-bright-mute)] mb-4">
            {eyebrow}
          </p>
        )}
        <h2 className="font-lj-display font-[900] text-[clamp(1.75rem,3.6vw,3rem)] leading-[0.98] tracking-[-0.035em] text-[var(--color-lj-on-bright)]">
          {headline}
        </h2>
        {sub && (
          <p className="mt-4 text-[0.9375rem] sm:text-base leading-[1.5] text-[var(--color-lj-on-bright-mute)]">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}
