'use client'

import { useMemo, useState } from 'react'
import type { Product, StockStatus } from '@ximi4ka-shop/shared'
import {
  ImageUploadField,
  MultiImageUploadField,
} from './ImageUploadField'
import { BlockEditor } from './block-editor/BlockEditor'
import { ApiError, type AdminProductInput } from '@/lib/adminApi'

interface Props {
  mode: 'create' | 'edit'
  initialValue?: Product
  onSubmit: (input: AdminProductInput) => Promise<void>
  submitting: boolean
  error?: ApiError | null
}

const SLUG_RE = /^[a-z0-9-]+$/

interface ImageItem {
  url: string
  alt: string
}

// Controlled create/edit form. Groups inputs by section; keeps local state
// only (the parent decides how to submit).
export function ProductForm({
  mode,
  initialValue,
  onSubmit,
  submitting,
  error,
}: Props) {
  const [slug, setSlug] = useState(initialValue?.slug ?? '')
  const [name, setName] = useState(initialValue?.name ?? '')
  const [sku, setSku] = useState(initialValue?.sku ?? '')
  const [priceRub, setPriceRub] = useState<number>(initialValue?.priceRub ?? 0)
  const [compareAt, setCompareAt] = useState<number | ''>(
    initialValue?.compareAtPriceRub ?? '',
  )
  const [stockStatus, setStockStatus] = useState<StockStatus>(
    initialValue?.stockStatus ?? 'in_stock',
  )
  const [sortOrder, setSortOrder] = useState<number>(
    initialValue?.sortOrder ?? 0,
  )
  const [shortDescription, setShortDescription] = useState(
    initialValue?.shortDescription ?? '',
  )
  const [longDescriptionBlocks, setLongDescriptionBlocks] = useState<unknown[]>(
    () => initialValue?.longDescriptionBlocks ?? [],
  )

  // SEO
  const [metaTitle, setMetaTitle] = useState(initialValue?.metaTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(
    initialValue?.metaDescription ?? '',
  )
  const [ogImage, setOgImage] = useState<string | null>(
    initialValue?.ogImage ?? null,
  )
  const [canonicalUrl, setCanonicalUrl] = useState(
    initialValue?.canonicalUrl ?? '',
  )
  const [noindex, setNoindex] = useState<boolean>(
    initialValue?.noindex ?? false,
  )

  // Media gallery
  const [images, setImages] = useState<ImageItem[]>(
    () =>
      (initialValue?.images ?? []).map((img) => ({
        url: img.url,
        alt: img.alt ?? '',
      })) as ImageItem[],
  )

  const [formError, setFormError] = useState<string | null>(null)

  const slugInvalid = slug !== '' && !SLUG_RE.test(slug)

  const disabled = useMemo(() => submitting, [submitting])

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
    if (!Number.isFinite(priceRub) || priceRub < 0) {
      setFormError('Цена должна быть неотрицательным числом.')
      return
    }

    const input: AdminProductInput = {
      slug,
      name: name.trim(),
      sku: sku.trim() || null,
      priceRub: Math.trunc(priceRub),
      compareAtPriceRub:
        compareAt === '' ? null : Math.trunc(Number(compareAt)),
      stockStatus,
      sortOrder: Math.trunc(sortOrder),
      shortDescription: shortDescription.trim() || null,
      longDescriptionBlocks,
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      ogImage: ogImage || null,
      canonicalUrl: canonicalUrl.trim() || null,
      noindex,
    }

    // The api's shared Product type is authoritative; we only pass the
    // gallery via translations until a dedicated product_images endpoint
    // lands. For now it's not part of AdminProductInput — the future
    // endpoint will handle it. We stash to translations just so it round-
    // trips visually (harmless: the field is jsonb).
    if (images.length > 0) {
      input.translations = {
        ...(initialValue?.translations ?? {}),
        gallery: images,
      }
    }

    await onSubmit(input)
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={mode === 'create' ? 'Создание товара' : 'Редактирование товара'}
      className="space-y-8"
    >
      <Section title="Основные">
        <Field label="Slug" htmlFor="slug" error={slugInvalid ? 'Недопустимый slug' : undefined}>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="test-kit-3-3"
            required
            className="input"
          />
        </Field>
        <Field label="Название" htmlFor="name">
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU" htmlFor="sku">
            <input
              id="sku"
              value={sku ?? ''}
              onChange={(e) => setSku(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Наличие" htmlFor="stock-status">
            <select
              id="stock-status"
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value as StockStatus)}
              className="input"
            >
              <option value="in_stock">В наличии</option>
              <option value="out_of_stock">Нет в наличии</option>
              <option value="preorder">Предзаказ</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Цена, ₽" htmlFor="price">
            <input
              id="price"
              type="number"
              min={0}
              value={priceRub}
              onChange={(e) => setPriceRub(Number(e.target.value))}
              required
              className="input"
            />
          </Field>
          <Field label="Старая цена, ₽" htmlFor="compare-at">
            <input
              id="compare-at"
              type="number"
              min={0}
              value={compareAt}
              onChange={(e) =>
                setCompareAt(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="input"
            />
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
        <Field label="Короткое описание" htmlFor="short-desc">
          <textarea
            id="short-desc"
            value={shortDescription ?? ''}
            onChange={(e) => setShortDescription(e.target.value)}
            rows={3}
            className="input"
          />
        </Field>
      </Section>

      <Section title="Медиа">
        <ImageUploadField
          id="og-image"
          label="OG-изображение (для соцсетей)"
          value={ogImage}
          onChange={setOgImage}
        />
        <MultiImageUploadField
          label="Галерея товара"
          value={images}
          onChange={setImages}
        />
      </Section>

      <Section title="Описание (блоки)">
        <BlockEditor
          value={longDescriptionBlocks}
          onChange={(blocks) => setLongDescriptionBlocks(blocks)}
        />
      </Section>

      <Section title="SEO">
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
        <Field label="Canonical URL" htmlFor="canonical-url">
          <input
            id="canonical-url"
            value={canonicalUrl ?? ''}
            onChange={(e) => setCanonicalUrl(e.target.value)}
            maxLength={500}
            className="input"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-brand-text">
          <input
            type="checkbox"
            checked={noindex}
            onChange={(e) => setNoindex(e.target.checked)}
          />
          <span>noindex (исключить из поисковой выдачи)</span>
        </label>
      </Section>

      {(formError || error) ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {formError ??
            (error
              ? error.code === 'slug_conflict'
                ? 'Товар с таким slug уже существует.'
                : error.message
              : '')}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="px-5 py-2.5 rounded-full bg-brand text-white font-semibold disabled:opacity-50"
        >
          {submitting
            ? 'Сохранение...'
            : mode === 'create'
              ? 'Создать'
              : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-brand-border p-6">
      <h2 className="text-lg font-semibold text-brand-text mb-4">{title}</h2>
      {note ? (
        <p className="text-xs text-brand-text-secondary mb-3">{note}</p>
      ) : null}
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
      {error ? (
        <div className="mt-1 text-xs text-red-600">{error}</div>
      ) : null}
    </div>
  )
}
