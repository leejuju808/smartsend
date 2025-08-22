'use client'
import React, { useEffect, useState } from 'react'

export default function QuotaBadge({ kind = process.env.NEXT_PUBLIC_FREEWALL_KIND || 'demo' }: { kind?: string }) {
  const [state, setState] = useState<{ used: number; quota: number; loading: boolean; pro: boolean }>({ used: 0, quota: 0, loading: true, pro: false })
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/usage/status?kind=' + encodeURIComponent(kind), { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([s]) => {
      if (!alive || !s) return
      setState({ used: s.used ?? 0, quota: s.quota ?? 0, loading: false, pro: !!s.isPro || !Number.isFinite(s.quota) })
    })
    return () => { let _ = alive; alive = false }
  }, [kind])
  if (state.loading) return <span className="text-xs text-slate-400">…</span>
  if (state.pro) return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Pro</span>
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {kind}: {state.used}/{state.quota}
    </span>
  )
}

