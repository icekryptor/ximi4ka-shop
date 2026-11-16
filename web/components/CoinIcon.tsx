import Image from 'next/image'

// Монетка-химикоин: золотая монета с «Х» из public/img/brand/ximicoin.svg.
// Файл 188×166 — монета наклонена, поэтому size задаёт высоту, ширина по пропорции.
const COIN_W = 188
const COIN_H = 166

export function CoinIcon({ size = 14 }: { size?: number }) {
  const width = Math.round((size * COIN_W) / COIN_H)
  return (
    <Image
      src="/img/brand/ximicoin.svg"
      alt=""
      aria-hidden="true"
      width={width}
      height={size}
      unoptimized
      data-coin-icon=""
      className="shrink-0"
      style={{ width, height: size }}
    />
  )
}
