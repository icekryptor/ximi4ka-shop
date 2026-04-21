'use client'

import { useMemo, useState } from 'react'
import type { Page } from '@ximi4ka-shop/shared'
import { ImageUploadField } from './ImageUploadField'
import { BlockEditor } from './block-editor/BlockEditor'
import { ApiError, type AdminPageInput } from '@/lib/adminApi'
import { LanguageTabs, countFilled } from './LanguageTabs'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

const EN_TRACKED_FIELDS = ['title', 'metaTitle', 'metaDescription'] as const

interface Props {
  mode: 'create' | 'edit'
  initialValue?: Page
  onSubmit: (input: AdminPageInput) => Promise<void>
  submitting: boolean
  error?: ApiError | null
}

const SLUG_RE = /^[a-z0-9-]+$/

// Controlled create/edit form for CMS pages. Mirrors ProductForm but slimmer:
// pages only have a title + blocks + SEO. Parent owns the submit side-effects.
export function PageForm({
  mode,
  initialValue,
  onSubmit,
  submitting,
  error,
}: Props) {
  const [slug, setSlug] = useState(initialValue?.slug ?? '')
  const [title, setTitle] = useState(initialValue?.title ?? '')
  const [blocks, setBlocks] = useState<unknown[]>(
    () => initialValue?.blocks ?? [],
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

  // i18n state (see ProductForm for rationale).
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE)
  const initialEn = (initialValue?.translations as
    | { en?: Record<string, unknown> }
    | undefined)?.en
  const [enTitle, setEnTitle] = useState<string>(
    typeof initialEn?.title === 'string' ? initialEn.title : '',
  )
  const [enMetaTitle, setEnMetaTitle] = useState<string>(
    typeof initialEn?.metaTitle === 'string' ? initialEn.metaTitle : '',
  )
  const [enMetaDescription, setEnMetaDescription] = useState<string>(
    typeof initialEn?.metaDescription === 'string' ? initialEn.metaDescription : '',
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
    if (!title.trim()) {
      setFormError('Заголовок обязателен.')
      return
    }

    const input: AdminPageInput = {
      slug,
      title: title.trim(),
      blocks,
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      ogImage: ogImage || null,
      canonicalUrl: canonicalUrl.trim() || null,
      noindex,
    }

    // EN translation block, only when at least one field is filled.
    const enBlock: Record<string, unknown> = {}
    if (enTitle.trim()) enBlock.title = enTitle.trim()
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
  const enFilled = countFilled([enTitle, enMetaTitle, enMetaDescription])

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={mode === 'create' ? 'Создание страницы' : 'Редактирование страницы'}
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
                ? 'Страница с таким slug уже существует.'
                : undefined
          }
        >
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="o-nas"
            required
            className="input"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Страница со slug «home» становится главной.
          </p>
        </Field>
        {activeLocale === DEFAULT_LOCALE ? (
          <Field label="Заголовок" htmlFor="title">
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="input"
            />
          </Field>
        ) : (
          <Field label="Заголовок (EN)" htmlFor="title-en">
            <input
              id="title-en"
              value={enTitle}
              onChange={(e) => setEnTitle(e.target.value)}
              placeholder={title || 'RU fallback'}
              className="input"
            />
          </Field>
        )}
      </Section>

      <Section title="Блоки">
        <BlockEditor value={blocks} onChange={(b) => setBlocks(b)} />
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
        <ImageUploadField
          id="og-image"
          label="OG-изображение (для соцсетей)"
          value={ogImage}
          onChange={setOgImage}
        />
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

      {formError || (error && !slugConflictError) ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {formError ?? error?.message}
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
  children,
}: {
  title: string
  children: React.ReactNode
}) {
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
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-brand-text-secondary mb-1"
      >
        {label}
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
