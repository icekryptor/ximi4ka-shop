import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { WholesaleOrder } from './WholesaleOrder'

interface Props {
  /** Путь страницы /opt с учётом локали. */
  href: string
}

const HIGHLIGHTS = [
  'Наборы — до −599 ₽ с каждого',
  'Реагенты и оборудование — до −30%',
  'Пробирки и пипетки — цена партии',
]

/** Короткая секция главной: сводка скидок и тот же блок заказа, что на /opt. */
export function WholesaleHomeSection({ href }: Props) {
  return (
    <LabSection variant="cream" id="wholesale" className="px-6 py-32">
      <div className="mx-auto grid max-w-[var(--max-lj-content)] gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <h2 className="font-lj-display text-[clamp(2rem,4vw,3.5rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
            Оптом дешевле
          </h2>
          <ul className="flex flex-col gap-2 font-lj-body text-base">
            {HIGHLIGHTS.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <Link href={href} className="font-lj-body text-base underline underline-offset-4">
            Все условия опта
          </Link>
        </div>
        <WholesaleOrder />
      </div>
    </LabSection>
  )
}
