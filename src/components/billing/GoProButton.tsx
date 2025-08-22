"use client"
import { useState } from 'react'

export default function GoProButton({ userId, priceId }: { userId: string; priceId?: string }) {
  const [loading, setLoading] = useState(false)
  return (
    <form
      action="/api/checkout"
      method="post"
      onSubmit={() => setLoading(true)}
      className="space-y-2"
    >
      <input type="hidden" name="userId" value={userId} />
      {priceId ? <input type="hidden" name="priceId" value={priceId} /> : null}
      <input type="hidden" name="plan_term" value="monthly" />
      <input name="promo" placeholder="Coupon code" className="w-full rounded border px-2 py-1 text-sm" />
      <button disabled={loading} className="px-4 py-2 w-full rounded bg-black text-white disabled:opacity-50">
        {loading ? 'Redirecting…' : 'Upgrade to Pro'}
      </button>
    </form>
  )
}

'use client'
import { useState } from 'react'

export default function GoProButton({ userId, priceId }: { userId: string; priceId?: string }) {
  const [pending, setPending] = useState(false)

  async function startCheckout() {
    try {
      setPending(true)
      const res = await fetch('/api/billing/create-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, priceId }),
      })
      const { url, error } = await res.json()
      if (!res.ok || error) throw new Error(error || 'Failed to start checkout')
      window.location.href = url as string
    } catch (err: any) {
      alert(err?.message || 'Unable to start checkout')
    } finally {
      setPending(false)
    }
  }

  return (
    <button onClick={startCheckout} disabled={pending || !userId} className="px-4 py-2 w-full rounded bg-black text-white disabled:opacity-50">
      {pending ? 'Redirecting…' : 'Upgrade to Pro'}
    </button>
  )
}

