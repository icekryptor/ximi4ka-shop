import {
  EAEU_CARD_RULES,
  EAEU_GUIDE_ID,
  EAEU_GUIDE_STEPS,
  EAEU_GUIDE_TITLE,
} from '@/lib/orderProcess'

// Гайд «Как заказать в Беларусь, Казахстан, Армению и Киргизию» для /order-process.
// Шаги и правила карт лежат в lib/orderProcess.ts — те же формулировки идут в чекаут.
export function EaeuOrderGuide() {
  return (
    <section
      id={EAEU_GUIDE_ID}
      aria-labelledby={`${EAEU_GUIDE_ID}-title`}
      className="flex scroll-mt-24 flex-col gap-6"
    >
      <h2
        id={`${EAEU_GUIDE_ID}-title`}
        className="font-lj-display text-2xl font-[700] tracking-[-0.03em]"
      >
        {EAEU_GUIDE_TITLE}
      </h2>

      <ol className="m-0 flex max-w-[48rem] list-none flex-col gap-5 p-0">
        {EAEU_GUIDE_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-9 flex-none items-center justify-center rounded-full bg-[var(--color-lj-ink)] font-lj-mono text-sm text-[var(--color-lj-bone)]"
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1 font-lj-body">
              <h3 className="m-0 text-base font-[700]">{step.title}</h3>
              <p className="m-0 text-base leading-[1.6] opacity-85">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <ul
        aria-label="Какими картами можно оплатить доставку в эти страны"
        className="m-0 flex max-w-[48rem] list-none flex-col border border-[var(--color-lj-rule)] p-0"
      >
        {EAEU_CARD_RULES.map((rule) => (
          <li
            key={rule.card}
            className="flex items-start gap-3 border-t border-[var(--color-lj-rule)] px-4 py-3 font-lj-body text-[0.9375rem] first:border-t-0"
          >
            <span className="flex-none font-[700]" aria-hidden="true">
              {rule.accepted ? '✓' : '✕'}
            </span>
            <span className={rule.accepted ? '' : 'opacity-70'}>
              {rule.card}
              <span className="sr-only">
                {rule.accepted ? ': принимаем' : ': пока не принимаем'}
              </span>
            </span>
            {!rule.accepted && (
              <span className="ml-auto flex-none font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.04em] opacity-70">
                скоро
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 max-w-[48rem] font-lj-body text-[0.9375rem] opacity-80">
        Приём Visa и Mastercard, выпущенных в этих странах, мы подключаем — как только появится,
        обновим эту страницу.
      </p>
    </section>
  )
}
