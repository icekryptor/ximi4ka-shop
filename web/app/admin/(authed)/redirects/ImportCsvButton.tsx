'use client'

import { useState } from 'react'
import { CsvImportDialog } from '@/components/admin/CsvImportDialog'

// Small wrapper so the list page (server component) can compose the
// dialog-toggling client state without becoming a client component itself.
export function ImportCsvButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-full bg-brand-bg-soft text-brand-text font-medium hover:bg-brand-bg-soft/80"
      >
        Импорт CSV
      </button>
      <CsvImportDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
