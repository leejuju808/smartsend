'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { supabaseBrowser } from '@/lib/supabase-browser'

interface MailboxQuotaRow {
  account_id: string
  user_id: string
  sent_today: number
  daily_cap: number
  warmup_enabled: boolean
  warmup_day: number | null
  warmup_started_at: string | null
  warmup_plan_id: string | null
  allowed_today?: number
  hard_cap?: number
  effective_cap?: number
  email?: string
}

export default function MailboxQuota() {
  const sb = supabaseBrowser()
  const [rows, setRows] = useState<MailboxQuotaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      // Get current user
      const { data: { user } } = await sb.auth.getUser()
      if (!user?.id) {
        setLoading(false)
        return
      }

      // Fetch quota view data for user's mailboxes
      const { data, error } = await sb
        .from('v_mailbox_quota_today')
        .select('*')
        .eq('user_id', user.id)

      if (error) {
        console.error('Error loading quota:', error)
        setLoading(false)
        return
      }

      // For each mailbox, also fetch allowance RPC to compute effective cap
      const enriched = await Promise.all((data || []).map(async (r: any) => {
        const { data: allow } = await sb.rpc('get_mailbox_allowance', { acct_id: r.account_id })
        const a = allow?.[0] || {}
        const effCap = Math.min(a.allowed_today || 0, a.hard_cap || 0)

        // Fetch mailbox email for display
        const { data: accountData } = await sb
          .from('connected_accounts')
          .select('email')
          .eq('id', r.account_id)
          .single()

        return {
          ...r,
          allowed_today: a.allowed_today,
          hard_cap: a.hard_cap,
          effective_cap: effCap,
          email: accountData?.email || 'Unknown'
        }
      }))

      setRows(enriched)
    } catch (err) {
      console.error('Error loading quota:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">
          <div className="text-sm font-medium mb-3">Mailbox Quotas (Today)</div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">
          <div className="text-sm font-medium mb-3">Mailbox Quotas (Today)</div>
          <div className="text-sm text-muted-foreground">No mailboxes connected</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="text-sm font-medium">Mailbox Quotas (Today)</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(r => {
            const used = r.sent_today || 0
            const cap = r.effective_cap || r.daily_cap || 0
            const pct = cap ? Math.round((used / cap) * 100) : 0
            const warmupInfo = r.warmup_enabled && r.warmup_day
              ? `Day ${r.warmup_day}`
              : 'No warmup'

            return (
              <div key={r.account_id} className="border rounded-xl p-3">
                <div className="text-sm font-medium truncate">{r.email || r.account_id}</div>
                <div className="text-xs text-muted-foreground">
                  {warmupInfo} • Used {used}/{cap}
                </div>
                <div className="w-full h-2 rounded bg-muted mt-2 overflow-hidden">
                  <div
                    className={`h-2 transition-all ${
                      pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

