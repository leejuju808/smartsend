'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

interface SeriesData {
  day: string
  sent: number
  deliver_pct: number
  reply_pct: number
  bounce_pct: number
}

interface HealthData {
  series: SeriesData[]
}

export function HealthCharts({ mailboxId }: { mailboxId: string }) {
  const [series, setSeries] = useState<SeriesData[]>([])

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/mailboxes/${mailboxId}/health`)
      if (r.ok) {
        const json: HealthData = await r.json()
        setSeries(json.series || [])
      }
    })()
  }, [mailboxId])

  return (
    <div className="grid md:grid-cols-2 gap-6 mt-4">
      <div className="h-64 rounded border p-4">
        <div className="text-sm mb-4 font-medium">Sends (last 30 days)</div>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" hide />
            <YAxis />
            <Tooltip />
            <Bar dataKey="sent" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 rounded border p-4">
        <div className="text-sm mb-4 font-medium">Rates (delivery/reply/bounce)</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" hide />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="deliver_pct" stroke="#82ca9d" dot={false} />
            <Line type="monotone" dataKey="reply_pct" stroke="#8884d8" dot={false} />
            <Line type="monotone" dataKey="bounce_pct" stroke="#ff6b6b" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

