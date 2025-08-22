import 'server-only'
import { startRescueOffer } from '@/app/actions/billing'

export default async function RescueOfferCard() {
  const rescuePct = Number(process.env.RESCUE_DISCOUNT_PERCENT ?? 20)
  const rescueMonths = Number(process.env.RESCUE_DISCOUNT_MONTHS ?? 3)
  return (
    <div className="rounded-lg border bg-emerald-50 px-3 py-3 text-emerald-900 text-sm flex items-center justify-between gap-3">
      <div>
        You’re on Pro. If cost is the reason you’re leaving, we can offer you <b>{rescuePct}% off for {rescueMonths} months</b>.
      </div>
      <form action={startRescueOffer}>
        <button className="rounded-md bg-emerald-700 text-white text-xs px-3 py-1.5">
          Apply {rescuePct}% for {rescueMonths}m
        </button>
      </form>
    </div>
  )
}

'use client'
import React, { useEffect, useMemo } from 'react'
import { pickVariant, trackClient } from '@/lib/experiments/client'
import { startRescueOfferVariant } from '@/app/actions/billing'
import { useFormStatus } from 'react-dom'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="rounded-lg bg-black text-white text-sm px-3 py-2 disabled:opacity-50" disabled={pending}>
      {pending ? 'Applying…' : label}
    </button>
  )
}

export default function RescueOfferCard() {
  const variant = useMemo(() => pickVariant('rescue_pct_v1', ['A','B','C']), [])
  const offer = variant === 'A'
    ? { title: 'Keep Pro at 20% off', sub: 'Save for the next 3 months.', label: 'Apply 20% for 3 months' }
    : variant === 'B'
    ? { title: 'Limited-time 30% off', sub: 'Enjoy savings for 2 months.', label: 'Apply 30% for 2 months' }
    : { title: 'One month 40% off', sub: 'Stay on Pro at a big discount.', label: 'Apply 40% for 1 month' }

  useEffect(() => {
    trackClient('rescue_variant_shown', { variant })
  }, [variant])

  return (
    <div className="rounded-2xl border p-4 bg-emerald-50 border-emerald-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-emerald-900">{offer.title}</div>
          <div className="text-xs text-emerald-800">{offer.sub}</div>
        </div>
        <form action={startRescueOfferVariant} className="flex items-center gap-2">
          <input type="hidden" name="variant" value={variant} />
          <Submit label={offer.label} />
        </form>
      </div>
    </div>
  )
}
