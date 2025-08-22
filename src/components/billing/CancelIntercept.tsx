'use client'
import React, { useMemo, useState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { pickVariant, trackClient } from '@/lib/experiments/client'
import { startRescueOfferVariant } from '@/app/actions/billing'

function ActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="rounded-lg bg-black text-white text-sm px-3 py-2 disabled:opacity-50" disabled={pending}>
      {pending ? 'Loading…' : label}
    </button>
  )
}

export default function CancelIntercept({ trigger }: { trigger: boolean }) {
  const [open, setOpen] = useState(false)
  const variant = useMemo(() => pickVariant('rescue_pct_v1', ['A','B','C']), [])
  const offer =
    variant === 'A'
      ? { title: 'Wait! Keep Pro with 20% off', sub: 'Save for the next 3 months.', label: 'Apply 20% for 3 months' }
      : variant === 'B'
      ? { title: 'Limited-time 30% off', sub: 'Enjoy savings for 2 months.', label: 'Apply 30% for 2 months' }
      : { title: 'One month 40% off', sub: 'Stay on Pro at a big discount.', label: 'Apply 40% for 1 month' }

  useEffect(() => {
    if (!trigger) return
    setOpen(true)
    trackClient('cancel_intercept_shown', { variant })
  }, [trigger, variant])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-[520px] rounded-2xl border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{offer.title}</h3>
            <p className="text-sm text-slate-600">{offer.sub}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-500 text-sm">Close</button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <form action={startRescueOfferVariant} onSubmit={() => trackClient('cancel_intercept_clicked', { variant })}>
            <input type="hidden" name="variant" value={variant} />
            <ActionButton label={offer.label} />
          </form>
          <a href="/dashboard/billing" className="rounded-lg border text-sm px-3 py-2">No thanks</a>
        </div>
        <p className="mt-2 text-xs text-slate-500">Discount applies immediately; you can still cancel any time.</p>
      </div>
    </div>
  )
}

