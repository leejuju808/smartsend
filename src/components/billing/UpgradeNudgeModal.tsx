"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

export default function UpgradeNudgeModal() {
  const sb = createClientComponentClient()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: prof } = await sb.from('profiles').select('subscription_status').eq('id', user.id).maybeSingle()
      const isFree = !prof || (prof as any).subscription_status === 'free'
      if (!isFree) return
      const since = new Date()
      since.setHours(0,0,0,0)
      // Count total sends so far (not only today)
      const { data: cnt } = await sb
        .from('daily_send_counters')
        .select('count')
        .eq('user_id', user.id)
      const total = (cnt || []).reduce((a, r: any) => a + (Number(r.count) || 0), 0)
      if (total >= 10) setOpen(true)
    }
    run()
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <div className="text-base font-semibold">You’re on a roll! 🚀</div>
        <div className="text-sm text-gray-700 mt-1">You’ve sent 10 emails on the free plan. Upgrade to keep momentum and unlock higher limits.</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 rounded-md border">Not now</button>
          <a href="/dashboard/billing" className="text-sm px-3 py-1.5 rounded-md bg-black text-white">Upgrade</a>
        </div>
      </div>
    </div>
  )
}

