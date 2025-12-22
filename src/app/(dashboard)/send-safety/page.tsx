'use client'
import { useEffect, useState } from 'react'

type Sender = {
  id: string
  from_email: string
  status: string
  hourly_limit: number
  base_daily_limit: number
  target_daily_limit: number
  warmup_increment: number
  created_at: string
}

type SafetySnapshot = {
  hourly_limit: number
  warmed_daily_cap: number
  hour_used: number
  day_used: number
  bounce_rate: number
}

export default function SendSafetyPage() {
  const [sender, setSender] = useState<Sender | null>(null)
  const [snap, setSnap] = useState<SafetySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deliveryLog, setDeliveryLog] = useState('')
  
  // TODO: Replace with actual session user id
  const profileId = 'USER_PROFILE_ID'

  useEffect(() => {
    // Load first sender for demo; in real app, list/send selector
    const load = async () => {
      try {
        const res = await fetch(`/api/safety/snapshot?profile_id=${profileId}`)
        if (res.ok) {
          const data = await res.json()
          setSender(data.sender)
          setSnap(data.snapshot)
        } else {
          const errorData = await res.json()
          setError(errorData.error || 'Failed to load send safety data')
        }
      } catch (err) {
        setError('Failed to load send safety data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profileId])

  if (loading) {
    return <div className="p-8">Loading send safety…</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Make sure you have run the database migration and created a sender for your profile.
        </p>
      </div>
    )
  }

  if (!sender || !snap) {
    return <div className="p-8">Loading send safety…</div>
  }

  const hourRemain = Math.max(0, snap.hourly_limit - snap.hour_used)
  const dayRemain = Math.max(0, snap.warmed_daily_cap - snap.day_used)
  const risk =
    snap.bounce_rate >= 0.08 ? 'High'
    : snap.bounce_rate >= 0.05 ? 'Elevated'
    : 'Healthy'

  const runDeliveryNow = async () => {
    setDeliveryLog('Running delivery…')
    try {
      const res = await fetch('/api/cron/deliver', {
        headers: {
          'x-cron-secret': process.env.NEXT_PUBLIC_CRON_DEV_SECRET || ''
        }
      })
      const data = await res.json()
      setDeliveryLog(JSON.stringify(data, null, 2))
    } catch (err: any) {
      setDeliveryLog(`Error: ${err.message}`)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Send Safety</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl shadow bg-white">
          <div className="text-sm text-gray-500">Sender</div>
          <div className="text-lg font-medium">{sender.from_email}</div>
          <div className="mt-2">
            <span className={`px-2 py-1 rounded text-xs ${
              sender.status === 'active' ? 'bg-green-100 text-green-700' :
              sender.status === 'warming' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>{sender.status}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl shadow bg-white">
          <div className="text-sm text-gray-500">Hourly</div>
          <div className="text-3xl font-bold">{hourRemain}</div>
          <div className="text-xs text-gray-500">remaining / {snap.hourly_limit}</div>
        </div>

        <div className="p-4 rounded-2xl shadow bg-white">
          <div className="text-sm text-gray-500">Today</div>
          <div className="text-3xl font-bold">{dayRemain}</div>
          <div className="text-xs text-gray-500">remaining / {snap.warmed_daily_cap}</div>
        </div>
      </div>

      <div className="p-4 rounded-2xl shadow bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Bounce rate (last 200)</div>
            <div className="text-xl font-semibold">{(snap.bounce_rate * 100).toFixed(1)}%</div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm ${
            risk === 'High' ? 'bg-red-100 text-red-700' :
            risk === 'Elevated' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            Risk: {risk}
          </div>
        </div>
        {risk !== 'Healthy' && (
          <ul className="mt-3 text-sm list-disc ml-5 text-gray-700">
            <li>Auto-block suppressed & prior bounces</li>
            <li>Respect hourly/daily limits with warmup</li>
            <li>Consider reducing daily cap or improving list quality</li>
          </ul>
        )}
      </div>

      <div className="p-4 rounded-2xl shadow bg-white">
        <h2 className="text-lg font-semibold mb-3">Manual Delivery Worker (Dev)</h2>
        <button
          onClick={runDeliveryNow}
          className="px-4 py-2 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Run Delivery Now
        </button>
        {deliveryLog && (
          <pre className="mt-4 p-4 bg-gray-900 text-green-300 rounded-2xl whitespace-pre-wrap overflow-x-auto text-sm">
            {deliveryLog}
          </pre>
        )}
        <p className="mt-4 text-sm text-gray-500">
          In production, configure a Vercel Cron to call <code className="bg-gray-100 px-1 rounded">/api/cron/deliver</code> with the secret header.
        </p>
      </div>
    </div>
  )
}
