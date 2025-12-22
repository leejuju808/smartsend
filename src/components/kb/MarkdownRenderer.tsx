'use client'

import { mdToHtml } from '@/src/lib/send/render'
import SafeHtml from '@/components/SafeHtml'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Enhanced markdown processing for KB articles
  let processed = content
  
  // Handle code blocks
  processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="bg-muted border rounded-lg p-3 overflow-x-auto text-sm my-4"><code>${code.trim()}</code></pre>`
  })
  
  // Handle inline code
  processed = processed.replace(/`([^`]+)`/g, '<code class="bg-muted rounded px-1.5 py-0.5 text-sm">$1</code>')
  
  // Handle lists (basic support)
  processed = processed.replace(/^\- (.+)$/gm, '<li>$1</li>')
  processed = processed.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return `<ul class="list-disc pl-6 my-3 space-y-1">${match}</ul>`
  })
  
  // Convert to HTML
  const html = mdToHtml(processed)
  
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <SafeHtml html={html} />
    </div>
  )
}

