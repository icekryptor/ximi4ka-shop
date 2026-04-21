'use client'

import { useMemo, useState } from 'react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { ApiError, type AdminCategoryInput } from '@/lib/adminApi'
import {
  descendantIds,
  flattenTree,
  buildCategoryTree,
  type CategoryTreeNode,
} from '@/lib/categoryTree'
import { LanguageTabs, countFilled } from './LanguageTabs'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

const EN_TRACKED_FIELDS = ['name', 'metaTitle', 'metaDescription'] as const

interface Props {
  mode: 'create' | 'edit'
  initialValue?: ProductCategory
  // Flat list of all existing categories (including the one being edited).
  // Passed flat because the server components already fetch it that way;
  // the form rebuilds the tree for parent-selector indentation.
  allCategories: Array<ProductCategory & { productCount?: number }>
  onSubmit: (input: AdminCategoryInput) => Promise<void>
  submitting: boolean
  error?: ApiError | null
}

const SLUG_RE = /^[a-z0-9-]+$/

export function CategoryForm({
  mode,
  initialValue,
  allCategories,
  onSubmit,
  submitting,
  error,
}: Props) {
  const [slug, setSlug] = useState(initialValue?.slug ?? '')
  const [name, setName] = useState(initialValue?.name ?? '')
  const [parentId, setParentId] = useState<string>(initialValue?.parentId ?? '')
  const [sortOrder, setSortOrder] = useState<number>(initialValue?.sortOrder ?? 0)
  const [metaTitle, setMetaTitle] = useState(initialValue?.metaTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(initialValue?.metaDescription ?? '')
  // i18n — see ProductForm for rationale.
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE)
  const initialEn = (initialValue?.translations as
    | { en?: Record<string, unknown> }
    | undefined)?.en
  const [enName, setEnName] = useState<string>(
    typeof initialEn?.name === 'string' ? initialEn.name : '',
  )
  const [enMetaTitle, setEnMetaTitle] = useState<string>(
    typeof initialEn?.metaTitle === 'string' ? initialEn.metaTitle : '',
  )
  const [enMetaDescription, setEnMetaDescription] = useState<string>(
    typeof initialEn?.metaDescription === 'string' ? initialEn.metaDescription : '',
  )
  const [formError, setFormError] = useState<string | null>(null)

  const slugInvalid = slug !== '' && !SLUG_RE.test(slug)

  // Build the tree + flat DFS ordering once per render.
  const tree = useMemo(() => buildCategoryTree(allCategories), [allCategories])
  const flatNodes = useMemo(() => flattenTree(tree), [tree])

  // In edit mode, exclude self + all descendants from the parent selector to
  // prevent cycles. Create mode allows any existing category as parent.
  const excludedIds = useMemo(() => {
    if (mode !== 'edit' || !initialValue) return new Set<string>()
    const self = findNode(tree, initialValue.id)
    if (!self) return new Set<string>()
    return new Set<string>([self.id, ...descendantIds(self)])
  }, [mode, initialValue, tree])

  const parentOptions = flatNodes.filter((n) => !excludedIds.has(n.id))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!slug || slugInvalid) {
      setFormError('Укажите корректный slug (латиница, цифры, тире).')
      return
    }
    if (!name.trim()) {
      setFormError('Название обязательно.')
      return
    }

    const input: AdminCategoryInput = {
      slug,
      name: name.trim(),
      parentId: parentId === '' ? null : parentId,
      sortOrder: Math.trunc(sortOrder),
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
    }

    // EN translation block, only when at least one field is filled.
    const enBlock: Record<string, unknown> = {}
    if (enName.trim()) enBlock.name = enName.trim()
    if (enMetaTitle.trim()) enBlock.metaTitle = enMetaTitle.trim()
    if (enMetaDescription.trim())
      enBlock.metaDescription = enMetaDescription.trim()

    const nextTranslations: Record<string, unknown> = {
      ...((initialValue?.translations as Record<string, unknown> | undefined) ?? {}),
    }
    if (Object.keys(enBlock).length > 0) {
      nextTranslations.en = enBlock
    } else {
      delete nextTranslations.en
    }
    if (Object.keys(nextTranslations).length > 0) {
      input.translations = nextTranslations
    }

    await onSubmit(input)
  }

  const slugConflictError = error?.code === 'slug_conflict'
  const enFilled = countFilled([enName, enMetaTitle, enMetaDescription])

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={mode === 'create' ? 'Создание категории' : 'Редактирование категории'}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <LanguageTabs
          active={activeLocale}
          onChange={setActiveLocale}
          completeness={{
            en: { filled: enFilled, total: EN_TRACKED_FIELDS.length },
          }}
        />
        <span className="text-xs text-brand-text-secondary">
          RU — основная версия, EN — перевод с фолбэком
        </span>
      </div>

      <Section title="Основные">
        <Field
          label="Slug"
          htmlFor="slug"
          error={
            slugInvalid
              ? 'Недопустимый slug'
              : slugConflictError
                ? 'Категория с таким slug уже существует.'
                : undefined
          }
        >
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="chemistry-kits"
            required
            className="input"
          />
        </Field>
        {activeLocale === DEFAULT_LOCALE ? (
          <Field label="Название" htmlFor="name">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input"
            />
          </Field>
        ) : (
          <Field label="Название (EN)" htmlFor="name-en">
            <input
              id="name-en"
              value={enName}
              onChange={(e) => setEnName(e.target.value)}
              placeholder={name || 'RU fallback'}
              className="input"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Родительская категория" htmlFor="parent">
            <select
              id="parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="input"
            >
              <option value="">— Без родителя —</option>
              {parentOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {'— '.repeat(node.depth)}
                  {node.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Сортировка" htmlFor="sort-order">
            <input
              id="sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="SEO">
        {activeLocale === DEFAULT_LOCALE ? (
          <>
            <Field label="Meta title" htmlFor="meta-title">
              <input
                id="meta-title"
                value={metaTitle ?? ''}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={255}
                className="input"
              />
            </Field>
            <Field label="Meta description" htmlFor="meta-desc">
              <textarea
                id="meta-desc"
                value={metaDescription ?? ''}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                className="input"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Meta title (EN)" htmlFor="meta-title-en">
              <input
                id="meta-title-en"
                value={enMetaTitle}
                onChange={(e) => setEnMetaTitle(e.target.value)}
                maxLength={255}
                placeholder={metaTitle ?? ''}
                className="input"
              />
            </Field>
            <Field label="Meta description (EN)" htmlFor="meta-desc-en">
              <textarea
                id="meta-desc-en"
                value={enMetaDescription}
                onChange={(e) => setEnMetaDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={metaDescription ?? ''}
                className="input"
              />
            </Field>
          </>
        )}
      </Section>

      {formError || (error && !slugConflictError) ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {formError ?? error?.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-full bg-brand text-white font-semibold disabled:opacity-50"
        >
          {submitting ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function findNode(nodes: CategoryTreeNode[], id: string): CategoryTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-brand-border p-6">
      <h2 className="text-lg font-semibold text-brand-text mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-brand-text-secondary mb-1">
        {label}
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
