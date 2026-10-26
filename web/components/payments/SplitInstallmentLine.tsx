import Image from 'next/image'
import Link from 'next/link'
import { formatRub } from '@/lib/stockLabel'
import { SPLIT_PAYMENTS, splitPaymentRub } from '@/lib/splitInstallments'
import { SPLIT_GUIDE_PATH } from '@/lib/splitGuide'

// Чип Сплита по макету владельца (Figma «Химичка» 6213:202): серая капсула со значком и
// платежом, рядом «× 4 платежа в Сплит». Значок — официальный, локальный файл; скриптов
// Яндекса нет. Только для наборов и итога корзины; ведёт на «Как оплатить в Сплит».
export function SplitInstallmentLine({ priceRub }: { priceRub: number }) {
  const payment = splitPaymentRub(priceRub)
  if (payment === null) return null
  return (
    <Link
      href={SPLIT_GUIDE_PATH}
      data-testid="split-installments"
      title="Как оплатить в Сплит"
      className="inline-flex w-fit flex-wrap items-center gap-x-1.5 font-ys-text text-[0.8125rem] leading-[18px] text-black/85 hover:underline hover:underline-offset-4"
    >
      <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[#EDEFF2] pl-0.5 pr-2">
        <Image
          src="/img/brand/yandex-split-icon.svg"
          alt="Сплит"
          width={14}
          height={14}
          unoptimized
          className="h-[14px] w-[14px]"
        />
        <span className="whitespace-nowrap">{formatRub(payment)}</span>
      </span>
      <span>× {SPLIT_PAYMENTS} платежа в Сплит</span>
    </Link>
  )
}
