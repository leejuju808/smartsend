'use client'

import { useEffect } from 'react'

export function InboxHotkeys({ onBulk }:{ onBulk: (action:'replied'|'archived'|'open')=>void }) {
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'r') onBulk('replied')
      if (e.key === 'a') onBulk('archived')
      if (e.key === 'o') onBulk('open')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onBulk])
  return null
}

