import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import type { PromoVisual } from '@/lib/promoSlides'

/**
 * Картинки баннеров по макету Figma («баннеры», 144:4627 / 144:4642 / 144:4664).
 * Координаты — в пикселях макета 1440×760 относительно плашки; единица
 * `--u` (1/1440 ширины баннера) и сдвиг `--ox` задаёт PromoSlider: на широком
 * экране арт занимает весь баннер, на узком — правую часть макета (от x=560)
 * отдельной картинкой под текстом.
 */

const u = (n: number) => `calc(var(--u) * ${n})`

type Box = readonly [left: number, top: number, width: number, height: number]

interface LayerProps {
  /** описывающий прямоугольник повёрнутого блока — как в Figma */
  box: Box
  /** сам блок до поворота: ширина, высота */
  size: readonly [number, number]
  rotate?: number
  className?: string
  children: ReactNode
}

/** Повёрнутый блок: рамка из Figma центрирует его внутри описывающего прямоугольника. */
function Layer({ box, size, rotate = 0, className = '', children }: LayerProps) {
  const [left, top, width, height] = box
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        left: `calc(var(--u) * (${left} - var(--ox)))`,
        top: u(top),
        width: u(width),
        height: u(height),
      }}
    >
      <div
        className={`relative flex-none ${className}`.trim()}
        style={{
          width: u(size[0]),
          height: u(size[1]),
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}

interface CropProps {
  src: string
  /** исходный размер файла — нужен next/image, на вёрстку не влияет */
  intrinsic: readonly [number, number]
  /** положение и размер картинки внутри блока, в процентах — как в Figma */
  style: CSSProperties
  priority?: boolean
  sizes: string
}

/** Картинка, сдвинутая и растянутая внутри обрезающего блока. */
function Crop({ src, intrinsic, style, priority, sizes }: CropProps) {
  return (
    <Image
      src={src}
      alt=""
      width={intrinsic[0]}
      height={intrinsic[1]}
      sizes={sizes}
      priority={priority}
      className="absolute max-w-none"
      style={style}
    />
  )
}

const PX = (pct: number) => `${pct}%`

/** Фото на светлой рамке — планшеты платформы: белая обводка 3px, радиус 50. */
const TABLET_FRAME = 'border-solid border-white bg-[#0e0914]'
const tabletBorder: CSSProperties = { borderWidth: u(3), borderRadius: u(50) }

function GiftArt() {
  return (
    <>
      <Layer box={[909.47, 42.75, 219.03, 219.03]} size={[209.06, 209.06]} rotate={-2.8}>
        <div className="absolute inset-0 overflow-hidden">
          <Crop
            src="/img/promo/gift-bottle-top.webp"
            intrinsic={[800, 800]}
            sizes="(min-width: 1280px) 20vw, 40vw"
            style={{
              left: PX(-10.39),
              top: PX(-10.39),
              width: PX(120.77),
              height: PX(120.77),
            }}
          />
        </div>
      </Layer>
      <Layer box={[546.45, -148.51, 1102.29, 1104.73]} size={[844.6, 849.03]} rotate={-22.14}>
        <Image
          src="/img/promo/gift-box.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 60vw, 90vw"
          className="max-w-none object-contain"
        />
      </Layer>
      <Layer box={[1225.05, 95.78, 184.71, 284.22]} size={[121.07, 261.81]} rotate={15}>
        <div className="absolute inset-0 overflow-hidden">
          <Crop
            src="/img/promo/gift-naoh-1.webp"
            intrinsic={[900, 900]}
            sizes="(min-width: 1280px) 20vw, 40vw"
            style={{
              left: PX(-76.9),
              top: PX(-8.69),
              width: PX(253.81),
              height: PX(117.37),
            }}
          />
        </div>
      </Layer>
      <Layer box={[793, 406.24, 155.66, 239.53]} size={[102.03, 220.64]} rotate={-15}>
        <div className="absolute inset-0 overflow-hidden backdrop-blur-[16.5px]">
          <Crop
            src="/img/promo/gift-naoh-2.webp"
            intrinsic={[900, 900]}
            sizes="(min-width: 1280px) 20vw, 40vw"
            style={{
              left: PX(-76.99),
              top: PX(-10.37),
              width: PX(253.98),
              height: PX(117.83),
            }}
          />
        </div>
      </Layer>
    </>
  )
}

function OgeArt() {
  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: `calc(var(--u) * (557.59 - var(--ox)))`,
        top: u(-82.95),
        width: u(975.91),
        height: u(975.91),
      }}
    >
      <Crop
        src="/img/promo/oge-box.webp"
        intrinsic={[1800, 1800]}
        sizes="(min-width: 1280px) 70vw, 90vw"
        style={{ left: 0, top: PX(-9.22), width: '100%', height: '100%' }}
      />
    </div>
  )
}

function LearnArt() {
  return (
    <>
      <Layer box={[649.84, 155.37, 713.96, 675.97]} size={[594.3, 540.57]} rotate={-15}>
        <div className={`absolute inset-0 overflow-hidden ${TABLET_FRAME}`} style={tabletBorder}>
          <div className="relative size-full">
            <Crop
              src="/img/promo/learn-tablet-1.webp"
              intrinsic={[1500, 1364]}
              sizes="(min-width: 1280px) 45vw, 90vw"
              style={{ left: PX(3.27), top: PX(3.27), width: PX(93.46), height: PX(93.46) }}
            />
          </div>
        </div>
      </Layer>
      <Layer box={[953.69, -118.16, 1058.67, 807.32]} size={[939.52, 584.06]} rotate={-15}>
        <div className={`absolute inset-0 overflow-hidden ${TABLET_FRAME}`} style={tabletBorder}>
          <div className="relative size-full">
            <Crop
              src="/img/promo/learn-tablet-2.webp"
              intrinsic={[1900, 1133]}
              sizes="(min-width: 1280px) 65vw, 90vw"
              style={{ left: PX(1.74), top: PX(3.72), width: PX(96.51), height: PX(92.55) }}
            />
          </div>
        </div>
      </Layer>
    </>
  )
}

/** Иллюстрации баннера — чисто декоративные (aria-hidden), как фон в макете. */
export function PromoSlideArt({ visual }: { visual: PromoVisual }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size]"
    >
      {visual === 'gift' ? <GiftArt /> : visual === 'oge' ? <OgeArt /> : <LearnArt />}
    </div>
  )
}
