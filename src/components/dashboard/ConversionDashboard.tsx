'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/badge'

interface DashboardMetrics {
  emails_sent: number
  replies_received: number
  leads_identified: number
  hot_leads: number
  warm_leads: number
  cold_leads: number
  est_job_value: number
  last_updated: string
}

interface RecentReply {
  id: string
  from_email: string
  subject: string
  body_text: string
  classification: 'hot' | 'warm' | 'cold' | 'not_interested' | null
  received_at: string
}

export default function ConversionDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [recentReplies, setRecentReplies] = useState<RecentReply[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      // Fetch metrics
      const metricsRes = await fetch('/api/dashboard/conversion')
      if (metricsRes.ok) {
        const data = await metricsRes.json()
        setMetrics(data)
      }

      // Fetch recent replies (we'll add this endpoint next)
      const repliesRes = await fetch('/api/dashboard/conversion/replies')
      if (repliesRes.ok) {
        const replies = await repliesRes.json()
        setRecentReplies(replies.slice(0, 5)) // Top 5
      }
    } catch (error) {
      console.error('Error loading conversion dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getClassificationBadge = (classification: string | null) => {
    if (!classification) return null
    
    const variants: Record<string, { label: string; className: string }> = {
      hot: { label: 'HOT', className: 'bg-red-500/15 text-red-600' },
      warm: { label: 'WARM', className: 'bg-orange-500/15 text-orange-600' },
      cold: { label: 'COLD', className: 'bg-blue-500/15 text-blue-600' },
      not_interested: { label: 'Not Interested', className: 'bg-gray-500/15 text-gray-600' },
    }
    
    const variant = variants[classification] || variants.cold
    return (
      <Badge className={`text-[10px] font-semibold ${variant.className}`}>
        {variant.label}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const m = metrics || {
    emails_sent: 0,
    replies_received: 0,
    leads_identified: 0,
    hot_leads: 0,
    warm_leads: 0,
    cold_leads: 0,
    est_job_value: 0,
    last_updated: new Date().toISOString(),
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Quick Value Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Emails Sent</div>
            <div className="text-3xl font-semibold mt-1">{m.emails_sent}</div>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Replies Received</div>
            <div className="text-3xl font-semibold mt-1">{m.replies_received}</div>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Leads Identified</div>
            <div className="text-3xl font-semibold mt-1">{m.leads_identified}</div>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Hot Leads</div>
            <div className="text-3xl font-semibold mt-1 text-red-600">{m.hot_leads}</div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Estimated Job Value */}
      <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Estimated Job Value
              </div>
              <div className="text-4xl font-bold text-green-700">
                {formatCurrency(m.est_job_value)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Hot: ${formatCurrency(m.hot_leads * 7000)} • Warm: ${formatCurrency(m.warm_leads * 2500)} • Cold: ${formatCurrency(m.cold_leads * 500)}
              </div>
            </div>
            <div className="text-6xl">💰</div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Lead Feed (Live Replies) */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Lead Feed (Live Replies)</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReplies.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No replies yet. Once you start receiving replies, they'll show up here.
            </div>
          ) : (
            <div className="space-y-3">
              {recentReplies.map((reply) => (
                <div
                  key={reply.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {reply.from_email}
                        </span>
                        {getClassificationBadge(reply.classification)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {reply.body_text || reply.subject || 'No content'}
                      </p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(reply.received_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Next Actions */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Next Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {m.hot_leads > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                <span className="text-sm font-medium">
                  {m.hot_leads} hot lead{m.hot_leads !== 1 ? 's' : ''} ready to book
                </span>
                <Badge className="bg-red-500 text-white">Action Required</Badge>
              </div>
            )}
            {m.warm_leads > 0 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                <span className="text-sm font-medium">
                  Follow up with {m.warm_leads} warm lead{m.warm_leads !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-muted-foreground">SmartSend will automate</span>
              </div>
            )}
            {m.replies_received > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-medium">
                  {m.replies_received} homeowner{m.replies_received !== 1 ? 's' : ''} replied
                </span>
                <span className="text-xs text-muted-foreground">Auto-nudge in 24h if no reply</span>
              </div>
            )}
            {m.hot_leads === 0 && m.warm_leads === 0 && m.replies_received === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No actions needed. Start sending campaigns to see leads here.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

