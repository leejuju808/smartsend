'use client'
import React, { useEffect, useState } from 'react'
import { pickVariant, trackClient } from '@/lib/experiments/client'

type Props = {
  kind?: string
  children: React.ReactNode
  className?: string
}

export default function Freewall({ kind = 'demo', children, className }: Props) {
  const [state, setState] = useState<{loading:boolean; blocked:boolean; used:number; quota:number; isPro:boolean}>({
    loading: true, blocked: false, used: 0, quota: 0, isPro: false,
  })
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const url = new URL('/api/usage/status', window.location.origin)
    url.searchParams.set('kind', kind)
    fetch(url.toString(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const blocked = Number.isFinite(j.quota) ? j.used >= j.quota : false
        setState({ loading:false, blocked, used:j.used, quota:j.quota, isPro: !!j.isPro })
        const variant = pickVariant('upgrade_copy_v1')
        trackClient('upgrade_cta_shown', { surface: 'freewall', variant, blocked, used: j.used, quota: j.quota })
      })
      .catch(() => alive && setState(s => ({ ...s, loading:false })))
    return () => { alive = false }
  }, [kind])
  useEffect(() => {
    let alive = true
    fetch('/api/auth/get-user', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive) setUserId(j.userId ?? null) })
      .catch(() => { if (alive) setUserId(null) })
    return () => { alive = false }
  }, [])

  if (state.loading) return <>{children}</>
  if (!state.blocked) return <>{children}</>
  const variant = pickVariant('upgrade_copy_v1')
  const copy = variant === 'A'
    ? { title: 'You’ve hit today’s free limit', sub: (u:number,q:number)=>`You used ${u}/${q} today. Upgrade to keep going instantly.` }
    : { title: 'Out of free uses for today', sub: (u:number,q:number)=>`You’ve reached ${u}/${q}. Unlock unlimited usage with Pro.` }
  return (
    <div className={className}>
      <div className="rounded-2xl border p-6 bg-white space-y-3">
        <h3 className="text-lg font-semibold">{copy.title}</h3>
        <p className="text-sm text-slate-600">{copy.sub(state.used, state.quota)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              trackClient('upgrade_cta_clicked', { surface: 'freewall', variant })
              window.location.href = '/api/stripe/checkout?interval=monthly'
            }}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            Start for $1
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await fetch("/api/billing/topup", {
                  method:"POST",
                  headers:{ "Content-Type":"application/json" },
                  body: JSON.stringify({ pack: "200" })
                });
                const j = await r.json();
                if (j.url) window.location.href = j.url;
              } catch (error) {
                console.error('Failed to create topup session:', error);
              }
            }}
            className="px-4 py-2 rounded border hover:bg-gray-50"
          >
            Buy 200 credits
          </button>
        </div>
      </div>
    </div>
  )
}

