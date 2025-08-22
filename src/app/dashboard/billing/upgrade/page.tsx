"use client"
import { useState } from 'react'

export default function UpgradePage() {
  const userId = 'REPLACE_WITH_AUTHED_USER_ID'
  const [busy, setBusy] = useState(false)
  const [coupon, setCoupon] = useState('Founders50')

  async function upgrade() {
    setBusy(true)
    try {
      const r = await fetch('/api/billing/create-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, coupon }),
      })
      const j = await r.json()
      if (j?.url) window.location.href = j.url
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto grid gap-4">
      <h1 className="text-2xl font-semibold">Upgrade to Pro</h1>
      <p className="text-sm text-gray-600">Free: 50/day • Pro: 500/day + sequences + priority sending</p>
      <label className="text-sm">Coupon (optional)</label>
      <input
        value={coupon}
        onChange={(e)=>setCoupon(e.target.value)}
        className="border rounded-xl px-3 py-2"
      />
      <button onClick={upgrade} disabled={busy} className="rounded-xl bg-black text-white px-4 py-2">
        {busy ? 'Redirecting…' : 'Go to Checkout'}
      </button>
    </div>
  )
}

