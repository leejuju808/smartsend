'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { fetchSendStats, SendStats } from '@/lib/fetchSendStats'
import { useSendRealtime } from '@/hooks/useSendRealtime'

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold mt-1">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export default function SendOverview() {
  const [stats, setStats] = useState<SendStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const s = await fetchSendStats()
      setStats(s)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // initial load
  useEffect(() => { load() }, [load])

  // live bumps when logs/queue change
  useSendRealtime(() => {
    // small debounce: pull fresh numbers ~200ms later
    setTimeout(() => load(), 200)
  })

  const nextEta = stats?.next_send_at
    ? new Date(stats.next_send_at).toLocaleTimeString()
    : '—'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <Stat label="Sent Today" value={stats?.sent_today ?? '—'} />
      <Stat label="Total Sent" value={stats?.sent_total ?? '—'} />
      <Stat label="Failed Today" value={stats?.failed_today ?? '—'} />
      <Stat label="Pending Queue" value={stats?.queue_pending ?? '—'} />
      <Stat label="Next Send ETA" value={nextEta} sub={refreshing ? 'updating…' : ''} />
    </div>
  )
}

