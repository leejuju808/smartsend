"use client"

import DOMPurify from "dompurify"
import { useMemo } from "react"

export default function SafeHtml({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html || "", {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i
  }), [html])

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: clean || "<p>(no content)</p>" }}
    />
  )
}

