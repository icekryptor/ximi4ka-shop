import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { ORDER_STEPS } from '@/lib/orderProcess'
import { CdekTerms } from './CdekTerms'
import { DeliveryZones } from './DeliveryZones'

interface Props {
  /** Путь страницы /order-process с учётом локали. */
  href: string
}

/** Короткий блок главной: четыре шага заказа, условия по странам и сроки СДЭК. */
export function OrderProcessSection({ href }: Props) {
  return (
    <LabSection
      variant="cream"
      id="order-process"
      className="border-b border-[var(--color-lj-rule)] px-6 py-32"
    >
      <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-16">
        <h2 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.045em]">
          Заказ и <em className="italic text-[var(--color-lj-brand)] font-[900]">доставка</em>
        </h2>

        <ol
          aria-label="Шаги заказа"
          className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-4"
        >
          {ORDER_STEPS.map((step) => (
            <li
              key={step.index}
              className="flex flex-col gap-4 border border-[var(--color-lj-rule)] p-5"
            >
              <span className="font-lj-mazzard text-sm font-bold leading-[1.18] text-[var(--color-lj-brand-deep)]">
                {String(step.index).padStart(2, '0')}
              </span>
              <h3 className="m-0 font-lj-mazzard text-[1.125rem] leading-[1.15] tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="m-0 font-lj-body text-[0.9375rem] leading-[1.5] opacity-80">
                {step.summary}
              </p>
            </li>
          ))}
        </ol>

        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="m-0 font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Бесплатная доставка
            </h3>
            <DeliveryZones />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="m-0 font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Сроки СДЭК
            </h3>
            <CdekTerms />
          </div>
        </div>

        <Link href={href} className="font-lj-body text-base underline underline-offset-4">
          Подробнее о заказе и доставке
        </Link>
      </div>
    </LabSection>
  )
}
