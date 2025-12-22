'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { toast } from 'sonner'

type PreflightIssue = {
  code: string
  severity: 'block' | 'warn'
  message: string
  fix?: { action: string; payload?: any }
}

type PreflightData = {
  issues: PreflightIssue[]
  blocking: PreflightIssue[]
  remaining: number
  now: string
}

export function PreflightPanel({ campaignId, canOverride = false }: { campaignId: string, canOverride?: boolean }) {
  const [data, setData] = useState<PreflightData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/preflight`)
      if (r.ok) {
        const json = await r.json()
        setData(json)
      }
    } catch (e) {
      console.error('Failed to load preflight:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [campaignId])

  const fix = async (issue: PreflightIssue) => {
    if (!issue.fix) return

    // Client-handled actions become links
    const linkActions = new Set(['open_billing','reauth_mailbox','connect_mailbox','open_sequence','open_sequence_step'])
    if (linkActions.has(issue.fix.action)) {
      // route them appropriately
      if (issue.fix.action==='open_billing') location.href='/settings/billing'
      if (issue.fix.action==='reauth_mailbox') location.href=`/settings/mailboxes?reauth=${issue.fix.payload?.mailboxId||''}`
      if (issue.fix.action==='connect_mailbox') location.href='/settings/mailboxes'
      if (issue.fix.action==='open_sequence') location.href=`/sequences/${campaignId}`
      if (issue.fix.action==='open_sequence_step') location.href=`/sequences/step/${issue.fix.payload?.stepId}`
      return
    }

    const r = await fetch(`/api/campaigns/${campaignId}/preflight/fix`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(issue.fix) })
    if (r.ok) load()
  }

  if (loading) {
    return (
      <div className="rounded border p-4">
        <div className="text-sm text-muted-foreground">Loading preflight checks...</div>
      </div>
    )
  }

  if (!data) return null


  return (
    <div className="rounded border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Pre-flight Check</div>
        <Badge variant={data.blocking.length > 0 ? 'destructive' : 'default'}>
          {data.blocking.length > 0 ? 'Blocked' : 'Ready'}
        </Badge>
      </div>
      <div className="space-y-2">
        {data.issues.map((i) => (
          <div
            key={i.code}
            className="flex items-center justify-between border rounded p-2"
          >
            <div>
              <div className="text-sm">{i.message}</div>
              <div className="text-xs text-muted-foreground">
                {i.severity.toUpperCase()} • {i.code}
              </div>
            </div>
            {i.fix?.action && (
              <Button variant="outline" size="sm" onClick={()=>fix(i)}>
                {({
                  start_warmup:'Start warmup',
                  edit_daily_cap:'Set daily cap',
                  send_test:'Send test',
                  open_billing:'Open billing',
                  reauth_mailbox:'Re-authenticate',
                  connect_mailbox:'Connect mailbox',
                  open_sequence:'Open sequence',
                  open_sequence_step:'Edit step'
                } as any)[i.fix.action] || 'Fix'}
              </Button>
            )}
          </div>
        ))}
        {data.issues.length === 0 && (
          <div className="text-sm text-muted-foreground">All systems go.</div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            const res = await fetch(`/api/campaigns/${campaignId}/launch`, {
              method: "POST",
            });
            if (res.ok) {
              toast.success("Campaign launched!");
            } else {
              const error = await res.json().catch(() => ({ error: "Launch failed." }));
              toast.error(error.error || "Launch failed.");
            }
          }}
          disabled={data.blocking.length > 0}
        >
          Launch Campaign
        </Button>
        {canOverride && (
          <Link href={`/campaigns/${campaignId}/settings`} className="text-xs text-muted-foreground underline self-center">
            Owner override available in Settings
          </Link>
        )}
      </div>
    </div>
  )
}

