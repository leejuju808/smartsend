'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'

interface HealthData {
  summary: {
    sent_today: number
    deliver_pct_today: number
    reply_pct_today: number
    bounce_pct_today: number
  }
}

export function HealthHeader({ mailboxId }: { mailboxId: string }) {
  const [data, setData] = useState<HealthData | null>(null)
  
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/mailboxes/${mailboxId}/health`)
      if (r.ok) {
        const json = await r.json()
        setData(json)
      }
    })()
  }, [mailboxId])

  if (!data) return null

  const s = data.summary

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sent (today)</div>
          <div className="text-2xl font-semibold">{s.sent_today}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Delivery %</div>
          <div className="text-2xl font-semibold">{s.deliver_pct_today}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Reply %</div>
          <div className="text-2xl font-semibold">{s.reply_pct_today}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Bounce %</div>
          <div className="text-2xl font-semibold">{s.bounce_pct_today}%</div>
        </CardContent>
      </Card>
    </div>
  )
}

