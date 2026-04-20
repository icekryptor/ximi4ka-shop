'use client'

// Small wrappers used by per-type block editors. Not meant for forms with
// complex validation — ProductForm still uses its own `Field` helper.

interface LabeledInputProps {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
}

export function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: LabeledInputProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-brand-text-secondary mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white focus:outline-none focus:border-brand text-sm"
      />
    </label>
  )
}

interface LabeledTextareaProps {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
}

export function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: LabeledTextareaProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-brand-text-secondary mb-1">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white focus:outline-none focus:border-brand text-sm"
      />
    </label>
  )
}
