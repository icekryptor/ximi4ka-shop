'use client'

// Temporary manual-test surface for the rich text editor. Not linked from
// the sidebar — navigate via the URL. Will be removed or repurposed once
// the editor is wired into the block editor and product form.

import { useState } from 'react'
import { RichTextEditor } from '@/components/admin/RichTextEditor'

const INITIAL_HTML =
  '<p>Попробуйте редактор. <strong>Жирный</strong>, <em>курсив</em>, <a href="https://ximi4ka.ru">ссылка</a>.</p>'

export default function PlaygroundPage() {
  const [html, setHtml] = useState(INITIAL_HTML)
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-text mb-4">
        Песочница редактора
      </h1>
      <RichTextEditor
        value={html}
        onChange={setHtml}
        placeholder="Введите текст..."
      />
      <h2 className="text-lg font-semibold mt-8 mb-2 text-brand-text">HTML</h2>
      <pre className="bg-white border border-brand-border rounded-lg p-4 text-xs whitespace-pre-wrap">
        {html}
      </pre>
      <h2 className="text-lg font-semibold mt-8 mb-2 text-brand-text">
        Предпросмотр
      </h2>
      <div
        className="bg-white border border-brand-border rounded-lg p-4 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
