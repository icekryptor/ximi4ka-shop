'use client'

import { useEffect, useRef, useState } from 'react'
import { saveCity } from '@/lib/deliveryCity'
import { etaDayLabel, useDeliveryEta } from '@/lib/deliveryEta'
import { DeliveryCityDialog } from './DeliveryCityDialog'

function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d="M2 6h11v10H2z" />
      <path d="M13 9h4.5L21 12.5V16h-8z" />
      {/* Колёса залиты цветом чипа — перекрывают низ кузова. */}
      <circle cx="6.5" cy="17.5" r="2" fill="var(--color-lj-brand-deep)" />
      <circle cx="17" cy="17.5" r="2" fill="var(--color-lj-brand-deep)" />
    </svg>
  )
}

// Высота чипа; место под него держим и пока срока нет — страница не прыгает.
export const ETA_CHIP_RESERVE = 'min-h-[28px]'

// Сам чип: грузовик и срок на фирменном фиолетовом. Срок доставки — довод
// купить, поэтому чип крупный и яркий, а не серая подпись.
export function EtaChip({ label, title }: { label: string; title: string }) {
  return (
    <span
      data-testid="delivery-eta-chip"
      title={title}
      className="inline-flex min-h-[28px] w-fit max-w-full items-center gap-1.5 rounded-[14px] bg-[var(--color-lj-brand-deep)] py-1 pl-2.5 pr-3 font-lj-mazzard text-[0.9375rem] font-[500] leading-5 text-white"
    >
      <TruckIcon />
      {/* «Доставка:» видна всем: одна дата в чипе без слова не читалась. В узкой
          сводке чекаута даты целиком уходят на вторую строку. */}
      <span>
        Доставка: <span className="whitespace-nowrap">{label}</span>
      </span>
    </span>
  )
}

export function etaChipTitle(cityName: string | undefined): string {
  return cityName
    ? `Самая ранняя доставка в пункт СДЭК: ${cityName}`
    : 'Самая ранняя доставка в пункт СДЭК'
}

const CAPTION_CLASS = 'font-ys-text text-[0.75rem] leading-4 text-black/55'
const CAPTION_BUTTON_CLASS =
  'cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:text-black/85'

// Чип «грузовик + когда приедет»: «завтра», «послезавтра» или дата. Срок —
// самый ранний до пункта СДЭК в городе покупателя, с сутками на сборку. Город
// не выбран — самый быстрый возможный срок и просьба выбрать город.
// caption — подпись под чипом и выбор города; в карточке каталога её нет.
// Высота зарезервирована всегда — и пока срок считается, и когда СДЭК не
// ответил: чип появляется после ответа api и не должен сдвигать страницу.
export function DeliveryEtaChip({ caption = false }: { caption?: boolean }) {
  const { city, eta, refreshing } = useDeliveryEta()
  const [picking, setPicking] = useState(false)
  const captionButton = useRef<HTMLButtonElement>(null)
  const wasPicking = useRef(false)

  // Окно закрылось — фокус возвращается на подпись, с которой его открыли.
  useEffect(() => {
    if (wasPicking.current && !picking) captionButton.current?.focus()
    wasPicking.current = picking
  }, [picking])

  const reserve = caption ? 'min-h-[48px]' : ETA_CHIP_RESERVE
  // Срока нет: первый расчёт ещё идёт или СДЭК не ответил — только место.
  if (eta === null || (eta === undefined && !refreshing)) {
    return (
      <div
        data-testid="delivery-eta"
        data-state={eta === null ? 'none' : 'loading'}
        className={reserve}
      />
    )
  }

  return (
    <div
      data-testid="delivery-eta"
      data-state={eta ? 'ready' : 'loading'}
      className={`flex max-w-full flex-col items-start gap-1 ${reserve}`}
    >
      {eta ? (
        <EtaChip label={etaDayLabel(eta.dateMin, eta.today)} title={etaChipTitle(city?.name)} />
      ) : (
        // Город сменили, срок пересчитывается: подпись остаётся, чип — на подходе.
        <span className="h-[28px]" />
      )}
      {caption &&
        (city ? (
          <span className={`flex max-w-full items-baseline gap-1 ${CAPTION_CLASS}`}>
            <span className="min-w-0 truncate">{city.name}</span>
            <span aria-hidden="true">·</span>
            <button
              ref={captionButton}
              type="button"
              onClick={() => setPicking(true)}
              className={`shrink-0 ${CAPTION_BUTTON_CLASS}`}
            >
              изменить город
            </button>
          </span>
        ) : (
          <button
            ref={captionButton}
            type="button"
            onClick={() => setPicking(true)}
            className={`${CAPTION_CLASS} ${CAPTION_BUTTON_CLASS}`}
          >
            Выберите город для более точного срока доставки
          </button>
        ))}
      {picking && (
        <DeliveryCityDialog
          onChoose={(chosen) => {
            saveCity(chosen)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
