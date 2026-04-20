'use client'

import type { VideoBlock, VideoProvider } from '@ximi4ka-shop/shared'
import { LabeledInput } from '../FormFields'

interface Props {
  block: VideoBlock
  onChange: (next: VideoBlock) => void
}

export function VideoBlockEditor({ block, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Провайдер
        </span>
        <select
          value={block.provider}
          onChange={(e) =>
            onChange({ ...block, provider: e.target.value as VideoProvider })
          }
          className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white focus:outline-none focus:border-brand text-sm"
        >
          <option value="youtube">YouTube</option>
          <option value="vk">VK Видео</option>
          <option value="rutube">Rutube</option>
        </select>
      </label>
      <LabeledInput
        label="ID видео"
        placeholder="dQw4w9WgXcQ (для YouTube)"
        value={block.videoId}
        onChange={(videoId) => onChange({ ...block, videoId })}
      />
      <LabeledInput
        label="Заголовок"
        value={block.title ?? ''}
        onChange={(title) => onChange({ ...block, title: title || null })}
      />
    </div>
  )
}
