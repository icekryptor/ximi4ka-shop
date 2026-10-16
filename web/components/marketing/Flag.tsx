import type { FlagCode } from '@/lib/orderProcess'

interface Props {
  code: FlagCode
  className?: string
}

// Флаг страны из /img/flags (flag-icons, MIT). Emoji-флаги в Windows не
// рисуются, поэтому картинка. alt пустой: страна всегда названа текстом рядом.
export function Flag({ code, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 24px SVG: next/image для SVG ничего не оптимизирует
    <img
      src={`/img/flags/${code}.svg`}
      alt=""
      width={24}
      height={18}
      loading="lazy"
      className={`inline-block h-[18px] w-6 shrink-0 rounded-[2px] border border-[var(--color-lj-rule)] object-cover ${className}`.trim()}
    />
  )
}
