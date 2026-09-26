'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { ProductImage } from '@ximi4ka-shop/shared'
import { SpecimenCard } from '@/components/ui/SpecimenCard'

interface Props {
  images: ProductImage[]
  alt: string
  sku: string
  hoverFormula?: string
}

export function ProductHeroImage({ images, alt, sku, hoverFormula }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  if (images.length === 0) return <SpecimenCard size="pdp" sku={sku} />
  const active = images[activeIdx]
  return (
    <div className="group/img flex flex-col gap-4">
      <div
        data-main-image
        className="relative aspect-square bg-white border border-[var(--color-lj-rule)] rounded-[5px] overflow-hidden"
      >
        <Image
          src={active.url}
          alt={active.alt || alt}
          fill
          sizes="(max-width: 1024px) 100vw, 660px"
          className="object-cover"
          preload={activeIdx === 0}
        />
        {hoverFormula && (
          <div className="absolute bottom-3.5 left-3.5 z-[2] font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-lj-ink)] bg-[var(--color-lj-cream)] px-2.5 py-1.5 border border-[var(--color-lj-ink)] opacity-0 translate-y-2 transition-[opacity,transform] duration-500 group-hover/img:opacity-100 group-hover/img:translate-y-0">
            {hoverFormula}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div data-thumbnails className="flex gap-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === activeIdx}
              className={`relative aspect-square w-20 shrink-0 bg-white border rounded-[5px] overflow-hidden transition-[border-color] duration-300 ${
                i === activeIdx
                  ? 'border-[var(--color-lj-brand)]'
                  : 'border-[var(--color-lj-rule)] hover:border-[var(--color-lj-ink)]'
              }`}
            >
              <Image
                src={img.url}
                alt={img.alt || alt}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
