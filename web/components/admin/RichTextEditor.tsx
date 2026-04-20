'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useCallback, useEffect } from 'react'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

// Tiptap 3's StarterKit already bundles Bold, Italic, Strike, Underline,
// Heading, Blockquote, BulletList, OrderedList, Link, and UndoRedo — so we
// configure them through StarterKit's options rather than registering each
// extension separately. H2/H3 only: H1 is reserved for page titles rendered
// by the shell.

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-brand underline',
            target: '_blank',
            rel: 'noopener',
          },
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(sanitizeHtml(editor.getHTML()))
    },
    // Next.js App Router streams; without this, the editor tries to render
    // on the server and produces hydration mismatches.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[200px] p-4 prose prose-sm max-w-none focus:outline-none',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
  })

  // When the parent form resets or swaps the value, mirror it into the
  // editor. Guard with getHTML() equality so we don't loop on our own
  // onUpdate-driven changes.
  useEffect(() => {
    if (!editor) return
    if (value === editor.getHTML()) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="border border-brand-border rounded-lg overflow-hidden bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

interface ToolbarProps {
  editor: Editor
}

function Toolbar({ editor }: ToolbarProps) {
  const setLink = useCallback(() => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run()
  }, [editor])

  return (
    <div className="flex flex-wrap gap-1 border-b border-brand-border p-2 bg-brand-bg-soft">
      <ToolbarButton
        title="Жирный"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        title="Курсив"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="Подчёркнутый"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        title="Зачёркнутый"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </ToolbarButton>
      <div className="w-px bg-brand-border mx-1" aria-hidden />
      <ToolbarButton
        title="Заголовок 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        title="Заголовок 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        H3
      </ToolbarButton>
      <div className="w-px bg-brand-border mx-1" aria-hidden />
      <ToolbarButton
        title="Список"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        title="Нумерованный список"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
      <ToolbarButton
        title="Цитата"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “
      </ToolbarButton>
      <ToolbarButton
        title="Ссылка"
        active={editor.isActive('link')}
        onClick={setLink}
      >
        🔗
      </ToolbarButton>
      <div className="w-px bg-brand-border mx-1" aria-hidden />
      <ToolbarButton
        title="Отменить"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        title="Повторить"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
      >
        ↷
      </ToolbarButton>
    </div>
  )
}

interface ToolbarButtonProps {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-sm font-semibold min-w-8 ${
        active
          ? 'bg-brand text-white'
          : 'hover:bg-white text-brand-text'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}
