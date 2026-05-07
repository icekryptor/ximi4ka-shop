'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { ProductImage } from '@ximi4ka-shop/shared'
import { SpecimenCard } from '@/components/ui/SpecimenCard'

interface Props {
  images: ProductImage[]
  cornerMark: string
  alt: string
  sku: string
  hoverFormula?: string
}

export function ProductHeroImage({ images, cornerMark, alt, sku, hoverFormula }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  if (images.length === 0) return <SpecimenCard size="pdp" sku={sku} />
  const active = images[activeIdx]
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="callout-host group/img flex flex-col gap-4">
      <div
        data-main-image
        className="relative aspect-[4/5] bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 hover:border-[var(--color-lj-ink)]"
      >
        <span className="absolute top-3.5 left-3.5 z-[2] font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-55">
          {cornerMark}
        </span>
        <Image
          src={active.url}
          alt={active.alt || alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          preload={activeIdx === 0}
        />
        {hoverFormula && (
          <div className="absolute bottom-3.5 left-3.5 z-[2] font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-lj-ink)] bg-[var(--color-lj-cream)] px-2.5 py-1.5 border border-[var(--color-lj-ink)] opacity-0 translate-y-2 transition-[opacity,transform] duration-500 group-hover/img:opacity-100 group-hover/img:translate-y-0">
            {hoverFormula}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div data-thumbnails className="flex gap-3">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show image ${i + 1}`}
              className={`relative aspect-square w-20 bg-[var(--color-lj-cream-shade)] border overflow-hidden transition-[border-color] duration-300 ${
                i === activeIdx ? 'border-[var(--color-lj-ink)]' : 'border-[var(--color-lj-rule)]'
              }`}
            >
              <span className="absolute top-1 left-1 z-[2] font-[var(--font-lj-mono)] text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70">
                arr. {pad(i + 1)}
              </span>
              <Image src={img.url} alt={img.alt || alt} fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
