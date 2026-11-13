import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import { imageLoadingProps } from '@/lib/imageLoading'
import type { PromoVisual } from '@/lib/promoSlides'

/**
 * Картинки баннеров по макету Figma («баннеры», 144:4627 / 144:4642 / 144:4664).
 * Координаты — в пикселях макета 1440×760 относительно плашки (кроме планшетов
 * платформы: их по просьбе владельца уменьшили, чтобы целиком влезали в кадр); единица
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
const tabletBorder: CSSProperties = { borderWidth: u(2), borderRadius: u(32) }

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
          src="/img/promo/gift-kit-oge.webp"
          alt=""
          fill
          // Кандидат в LCP первого экрана. Next 16: `priority` даёт только
          // <link rel="preload"> без fetchpriority — картинка стоит в очереди
          // за шрифтами; high-приоритет задаём явно (см. lib/imageLoading.ts).
          {...imageLoadingProps('priority')}
          // Мобильный арт — ~75% ширины экрана; 90vw тянул вариант на 750px
          // там, где хватает 640px.
          sizes="(min-width: 1280px) 60vw, 75vw"
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
        {/* Без backdrop-blur из макета (стекло флакона): на серверах PageSpeed
            без GPU размытие подложки задерживает первый кадр. */}
        <div className="absolute inset-0 overflow-hidden">
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
      <Layer box={[655, 309.4, 428.3, 405.6]} size={[356.6, 324.3]} rotate={-15}>
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
      <Layer box={[823, 50, 582.2, 444]} size={[516.7, 321.2]} rotate={-15}>
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

/** левая координата макета с учётом сдвига `--ox` (узкий экран показывает правую часть) */
const ux = (n: number) => `calc(var(--u) * (${n} - var(--ox)))`

const TAPE_WORDS = [
  'Чёрная пятница',
  'Цены 2023',
  'Налетай!',
  'Чёрная пятница',
  'Цены 2023',
  'Налетай!',
]

interface TapeProps {
  left: number
  top: number
  width: number
  height: number
  rotate: number
  /** лента с надписью; без неё — просто полосатая */
  text?: boolean
}

/** Сигнальная лента «опасность», натянутая наискосок через баннер. */
function Tape({ left, top, width, height, rotate, text = false }: TapeProps) {
  return (
    <div
      className={`absolute flex items-center overflow-hidden whitespace-nowrap ${text ? 'bf-tape-text' : 'bf-stripes'}`}
      style={
        {
          left: ux(left),
          top: u(top),
          width: u(width),
          height: u(height),
          transform: `rotate(${rotate}deg)`,
          '--bf-stripe': u(height / 4),
          boxShadow: `0 0 ${u(36)} rgba(255, 150, 0, 0.45)`,
        } as CSSProperties
      }
    >
      {text
        ? TAPE_WORDS.map((word, i) => (
            <span
              key={i}
              className="font-lj-mazzard font-[700] uppercase tracking-[0.04em]"
              style={{ fontSize: u(height * 0.36), paddingInline: u(18) }}
            >
              {word}
              <span style={{ paddingLeft: u(36) }}>⚠</span>
            </span>
          ))
        : null}
    </div>
  )
}

/**
 * «Чёрная пятница»: без картинок, всё на CSS — пятно света, огромные «2023»
 * и три сигнальные ленты. Первый слайд не тянет ни одного файла.
 */
function BlackFridayArt() {
  return (
    <>
      {/* пятно оранжевого света за цифрами */}
      <div
        className="bf-pulse absolute rounded-full"
        style={{
          left: ux(560),
          top: u(-70),
          width: u(900),
          height: u(900),
          background:
            'radial-gradient(closest-side, rgba(255,170,0,0.5) 0%, rgba(255,90,0,0.26) 42%, rgba(255,60,0,0) 100%)',
        }}
      />

      <Tape left={760} top={40} width={860} height={54} rotate={-12} />

      {/* зачёркнутый нынешний год — над ценами прошлого */}
      <div
        className="absolute font-lj-mazzard font-[700] leading-none text-white/45 line-through decoration-[var(--bf-ember)]"
        style={{ left: ux(770), top: u(206), fontSize: u(60), textDecorationThickness: u(5) }}
      >
        2026
      </div>
      <div
        className="bf-fire-text absolute font-lj-mazzard font-[700] leading-none tracking-[-0.04em]"
        style={{ left: ux(748), top: u(246), fontSize: u(292) }}
      >
        2023
      </div>

      {/* полосатая лента лежит под лентой с надписью — текст не перекрывается */}
      <Tape left={640} top={640} width={1000} height={44} rotate={9} />
      <Tape left={600} top={548} width={1000} height={78} rotate={-7} text />
    </>
  )
}

/** Иллюстрации баннера — чисто декоративные (aria-hidden), как фон в макете. */
export function PromoSlideArt({ visual }: { visual: PromoVisual }) {
  return (
    <div
      aria-hidden="true"
      // «Чёрная пятница» не обрезается по рамке арта: ленты и свечение тянутся
      // до краёв баннера (его скругление обрезает их само).
      className={`pointer-events-none absolute inset-0 [container-type:inline-size] ${
        visual === 'blackFriday' ? '' : 'overflow-hidden'
      }`}
    >
      {visual === 'blackFriday' ? (
        <BlackFridayArt />
      ) : visual === 'gift' ? (
        <GiftArt />
      ) : visual === 'oge' ? (
        <OgeArt />
      ) : (
        <LearnArt />
      )}
    </div>
  )
}
