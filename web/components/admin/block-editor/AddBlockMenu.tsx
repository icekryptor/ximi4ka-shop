'use client'

import { useEffect, useRef, useState } from 'react'
import type { Block } from '@ximi4ka-shop/shared'
import { blockLabels } from './blockLabels'

interface Props {
  onAdd: (type: Block['type']) => void
}

export function AddBlockMenu({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Click-outside-to-close: captures mousedown so it beats any internal
  // handlers that would re-open.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative mt-6 inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark"
      >
        + Добавить блок
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 w-64 bg-white border border-brand-border rounded-lg shadow-lg z-10 overflow-hidden"
        >
          {(Object.entries(blockLabels) as Array<[Block['type'], string]>).map(
            ([type, label]) => (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => {
                  onAdd(type)
                  setOpen(false)
                }}
                className="block w-full text-left px-4 py-2 text-sm text-brand-text hover:bg-brand-bg-soft"
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
