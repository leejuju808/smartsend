// Block 18: Deliverability Overview Card
// SmartSend — Dashboard card showing deliverability metrics

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface DeliverabilityData {
  sent_7d: number
  open_rate: number
  rep_score: number
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}

export function DeliverabilityOverview() {
  const supabase = createClientComponentClient()
  const [data, setData] = useState<DeliverabilityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Get workspace_id (assuming current workspace context)
        const workspaceId = localStorage.getItem('workspace_id') || user.id

        const { data: overview, error } = await supabase
          .from('view_deliverability_overview')
          .select('sent_7d, open_rate, rep_score')
          .eq('workspace_id', workspaceId)
          .single()

        if (error) {
          console.error('Error loading deliverability overview:', error)
          // Fallback to default values
          setData({
            sent_7d: 0,
            open_rate: 0,
            rep_score: 100,
          })
        } else {
          setData(overview || {
            sent_7d: 0,
            open_rate: 0,
            rep_score: 100,
          })
        }
      } catch (error) {
        console.error('Error loading deliverability data:', error)
        setData({
          sent_7d: 0,
          open_rate: 0,
          rep_score: 100,
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supabase])

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Deliverability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  const displayData = data || {
    sent_7d: 0,
    open_rate: 0,
    rep_score: 100,
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Deliverability</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Sent (7d)" value={displayData.sent_7d} />
          <Stat
            label="Open rate"
            value={`${Math.round((displayData.open_rate ?? 0) * 100)}%`}
          />
          <Stat label="Reputation" value={Math.round(displayData.rep_score)} />
        </div>
      </CardContent>
    </Card>
  )
}

