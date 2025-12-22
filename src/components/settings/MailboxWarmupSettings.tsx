'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface Mailbox {
  id: string
  email: string
  provider: string
  daily_cap: number
  warmup_enabled: boolean
  warmup_day: number | null
  warmup_started_at: string | null
  warmup_plan_id: string | null
}

interface WarmupPlan {
  id: string
  name: string
}

export default function MailboxWarmupSettings() {
  const sb = supabaseBrowser()
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [plans, setPlans] = useState<WarmupPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user?.id) return

      // Load mailboxes
      const { data: accounts } = await sb
        .from('connected_accounts')
        .select('*')
        .eq('user_id', user.id)

      // Load warmup plans
      const { data: planData } = await sb
        .from('warmup_plans')
        .select('*')
        .order('name')

      setMailboxes(accounts || [])
      setPlans(planData || [])
    } catch (err) {
      console.error('Error loading mailboxes:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateMailbox = async (id: string, updates: Partial<Mailbox>) => {
    try {
      const { error } = await sb
        .from('connected_accounts')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      await load()
      setEditingId(null)
    } catch (err) {
      console.error('Error updating mailbox:', err)
      alert('Failed to update mailbox')
    }
  }

  const toggleWarmup = async (mailbox: Mailbox) => {
    const newWarmupEnabled = !mailbox.warmup_enabled
    const updates: Partial<Mailbox> = { warmup_enabled: newWarmupEnabled }
    
    // If enabling warmup and no start date, set it
    if (newWarmupEnabled && !mailbox.warmup_started_at) {
      updates.warmup_started_at = new Date().toISOString().split('T')[0]
      updates.warmup_day = 1
    }

    // If no plan selected, assign default
    if (newWarmupEnabled && !mailbox.warmup_plan_id && plans.length > 0) {
      const defaultPlan = plans.find(p => p.name === 'default-30d') || plans[0]
      updates.warmup_plan_id = defaultPlan.id
    }

    await updateMailbox(mailbox.id, updates)
  }

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Loading mailboxes...</div>
        </CardContent>
      </Card>
    )
  }

  if (mailboxes.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Mailbox Warmup Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">No mailboxes connected</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Mailbox Warmup Settings</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {mailboxes.map(mailbox => (
          <div key={mailbox.id} className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{mailbox.email}</div>
                <div className="text-xs text-muted-foreground">
                  Provider: {mailbox.provider}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mailbox.warmup_enabled}
                  onChange={() => toggleWarmup(mailbox)}
                  className="rounded"
                />
                <span className="text-sm">Warmup Enabled</span>
              </label>
            </div>

            {mailbox.warmup_enabled && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Daily Cap
                  </label>
                  {editingId === mailbox.id ? (
                    <input
                      type="number"
                      min="1"
                      defaultValue={mailbox.daily_cap}
                      onBlur={async (e) => {
                        await updateMailbox(mailbox.id, {
                          daily_cap: parseInt(e.target.value) || 40
                        })
                      }}
                      className="border rounded px-2 py-1 text-sm w-full"
                      autoFocus
                    />
                  ) : (
                    <div
                      className="text-sm cursor-pointer hover:underline"
                      onClick={() => setEditingId(mailbox.id)}
                    >
                      {mailbox.daily_cap}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Warmup Plan
                  </label>
                  {editingId === `${mailbox.id}-plan` ? (
                    <select
                      defaultValue={mailbox.warmup_plan_id || ''}
                      onChange={async (e) => {
                        await updateMailbox(mailbox.id, {
                          warmup_plan_id: e.target.value || null
                        })
                        setEditingId(null)
                      }}
                      className="border rounded px-2 py-1 text-sm w-full"
                      autoFocus
                    >
                      <option value="">None</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className="text-sm cursor-pointer hover:underline"
                      onClick={() => setEditingId(`${mailbox.id}-plan`)}
                    >
                      {plans.find(p => p.id === mailbox.warmup_plan_id)?.name || 'None'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Warmup Day
                  </label>
                  <div className="text-sm">
                    {mailbox.warmup_day ?? 1}
                    {mailbox.warmup_started_at && (
                      <span className="text-muted-foreground ml-1">
                        (started {new Date(mailbox.warmup_started_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Start Date
                  </label>
                  <div className="text-sm">
                    {mailbox.warmup_started_at
                      ? new Date(mailbox.warmup_started_at).toLocaleDateString()
                      : 'Not started'}
                  </div>
                </div>
              </div>
            )}

            {!mailbox.warmup_enabled && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  Daily Cap: {mailbox.daily_cap} (hard limit)
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

