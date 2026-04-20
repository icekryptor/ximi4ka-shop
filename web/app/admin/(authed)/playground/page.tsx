'use client'

// Temporary manual-test surface for admin editors. Not linked from the
// sidebar — navigate via the URL.

import { useState } from 'react'
import { RichTextEditor } from '@/components/admin/RichTextEditor'
import { BlockEditor } from '@/components/admin/block-editor/BlockEditor'

const INITIAL_HTML =
  '<p>Попробуйте редактор. <strong>Жирный</strong>, <em>курсив</em>, <a href="https://ximi4ka.ru">ссылка</a>.</p>'

export default function PlaygroundPage() {
  const [html, setHtml] = useState(INITIAL_HTML)
  const [blocks, setBlocks] = useState<unknown[]>([])

  return (
    <div className="max-w-5xl">
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

      <h2 className="text-lg font-semibold mt-12 mb-2 text-brand-text">
        Редактор блоков
      </h2>
      <BlockEditor value={blocks} onChange={setBlocks} />
      <h3 className="text-md font-semibold mt-8 mb-2 text-brand-text">
        JSON состояние
      </h3>
      <pre className="bg-white border border-brand-border rounded-lg p-4 text-xs whitespace-pre-wrap max-h-96 overflow-auto">
        {JSON.stringify(blocks, null, 2)}
      </pre>
    </div>
  )
}
