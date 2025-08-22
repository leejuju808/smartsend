'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { pickVariant, trackClient } from '@/lib/experiments/client'

export default function GlobalQuotaBanner({ kind = process.env.NEXT_PUBLIC_FREEWALL_KIND || 'demo' }: { kind?: string }) {
  const [state, setState] = useState<{ show: boolean; used: number; quota: number; blocked: boolean }>({
    show: false, used: 0, quota: 0, blocked: false,
  })
  useEffect(() => {
    let alive = true
    const dismissedKey = `quota_banner_dismissed_${kind}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissedKey) === '1') return
    const url = new URL('/api/usage/status', window.location.origin)
    url.searchParams.set('kind', String(kind))
    fetch(url.toString(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const blocked = Number.isFinite(j.quota) ? j.used >= j.quota : false
        const near = Number.isFinite(j.quota) ? (j.quota - j.used) <= 1 : false
        setState({ show: blocked || near, used: j.used, quota: j.quota, blocked })
        const variant = pickVariant('upgrade_copy_v1')
        if (blocked || near) trackClient('upgrade_cta_shown', { surface: 'banner', variant, blocked, used: j.used, quota: j.quota })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [kind])
  if (!state.show) return null
  const variant = pickVariant('upgrade_copy_v1')
  const msg = state.blocked
    ? (variant === 'A' ? `You’ve hit today’s free limit (${state.used}/${state.quota}). Upgrade to keep going.` : `No more free uses today (${state.used}/${state.quota}). Go Pro to continue.`)
    : (variant === 'A' ? `You’re almost out of free uses (${state.used}/${state.quota}). Upgrade to avoid interruptions.` : `Nearly out of free uses (${state.used}/${state.quota}). Pro keeps you moving.`)
  return (
    <div className="sticky top-0 z-40">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-b-2xl border-x border-b bg-white px-4 py-3 shadow-sm flex items-center justify-between">
          <div className="text-sm text-slate-700">{msg}</div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/billing"
              onClick={() => trackClient('upgrade_cta_clicked', { surface: 'banner', variant })}
              className="rounded-lg bg-black text-white text-xs px-3 py-2"
            >Upgrade</Link>
            <button
              onClick={() => sessionStorage.setItem(`quota_banner_dismissed_${kind}`, '1')}
              className="text-xs text-slate-500 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
