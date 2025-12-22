// Block 18: Deliverability Settings Page
// SmartSend — Settings page for warm-up, throttling, bounces, and domain verification

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { verifyDomain } from './actions'

interface WarmupState {
  id: string
  account_email: string
  daily_cap: number
  day_index: number
  paused: boolean
}

interface DomainRecord {
  id: string
  domain: string
  spf_pass: boolean
  dkim_pass: boolean
  dmarc_pass: boolean
  health_score: number
  last_checked: string | null
}

export default function DeliverabilitySettingsPage() {
  const supabase = createClientComponentClient()
  const [warmups, setWarmups] = useState<WarmupState[]>([])
  const [domains, setDomains] = useState<DomainRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [verifyMsg, setVerifyMsg] = useState('')

  useEffect(() => {
    loadTeamId()
    loadWarmups()
  }, [])

  useEffect(() => {
    if (teamId) {
      loadDomains()
    }
  }, [teamId])

  async function loadTeamId() {
    try {
      let tId = localStorage.getItem('activeTeamId')
      if (!tId) {
        const res = await fetch('/api/teams/list')
        const data = await res.json()
        if (data.items && data.items.length > 0) {
          tId = data.items[0].id
          localStorage.setItem('activeTeamId', tId)
        }
      }
      setTeamId(tId)
    } catch (error) {
      console.error('Error loading team:', error)
    }
  }

  async function loadWarmups() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const workspaceId = localStorage.getItem('workspace_id') || user.id

      const { data, error } = await supabase
        .from('warmup_state')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('account_email')

      if (error) {
        console.error('Error loading warmups:', error)
      } else {
        setWarmups(data || [])
      }
    } catch (error) {
      console.error('Error loading warmups:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadDomains() {
    if (!teamId) return
    try {
      const { data, error } = await supabase
        .from('sender_domains')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading domains:', error)
      } else {
        setDomains(data || [])
      }
    } catch (error) {
      console.error('Error loading domains:', error)
    }
  }

  async function onCheckDomain() {
    if (!domainInput || !teamId) {
      setVerifyMsg('Please enter a domain and ensure team is selected')
      return
    }

    setVerifying(true)
    setVerifyMsg('')
    setVerifyResult(null)

    try {
      const fd = new FormData()
      fd.append('domain', domainInput.trim())
      fd.append('teamId', teamId)

      const res = await verifyDomain(null, fd)
      setVerifyResult(res)
      setVerifyMsg('Verification complete')
      await loadDomains() // Refresh domain list
    } catch (e: any) {
      setVerifyMsg(String(e.message || e))
      setVerifyResult(null)
    } finally {
      setVerifying(false)
    }
  }

  async function toggleWarmup(id: string, currentPaused: boolean) {
    try {
      const { error } = await supabase
        .from('warmup_state')
        .update({ paused: !currentPaused })
        .eq('id', id)

      if (error) {
        console.error('Error toggling warmup:', error)
        alert('Failed to toggle warm-up')
      } else {
        loadWarmups()
      }
    } catch (error) {
      console.error('Error toggling warmup:', error)
      alert('Failed to toggle warm-up')
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Deliverability Dashboard</h1>
        <p className="text-gray-600">
          Verify sender domains (SPF, DKIM, DMARC), monitor health scores, and manage warm-up
        </p>
      </div>

      {/* Domain Verification Section */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Domain Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <input
              className="rounded-xl border px-3 py-2 w-full"
              placeholder="yourdomain.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCheckDomain()}
            />
            <Button
              onClick={onCheckDomain}
              disabled={verifying || !domainInput || !teamId}
              className="rounded-xl border px-5 py-2 text-sm"
            >
              {verifying ? 'Checking...' : 'Check'}
            </Button>
          </div>

          {verifyMsg && (
            <p className={`text-sm ${verifyMsg.includes('Error') || verifyMsg.includes('Failed') ? 'text-red-600' : 'text-gray-600'}`}>
              {verifyMsg}
            </p>
          )}

          {verifyResult && (
            <div className="rounded-2xl border p-4 space-y-2 bg-gray-50">
              <div className="flex justify-between">
                <span className="font-medium">SPF</span>
                <span className={verifyResult.spf ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {verifyResult.spf ? '✓ Pass' : '✗ Fail'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">DKIM</span>
                <span className={verifyResult.dkim ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {verifyResult.dkim ? '✓ Pass' : '✗ Fail'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">DMARC</span>
                <span className={verifyResult.dmarc ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {verifyResult.dmarc ? '✓ Pass' : '✗ Fail'}
                </span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-semibold">Health Score</span>
                <span className={`text-lg font-bold ${verifyResult.health >= 67 ? 'text-green-600' : verifyResult.health >= 33 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {verifyResult.health}/100
                </span>
              </div>
            </div>
          )}

          {/* Domain Records Table */}
          {domains.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3">Verified Domains</h3>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium">Domain</th>
                      <th className="text-center px-4 py-2 text-sm font-medium">SPF</th>
                      <th className="text-center px-4 py-2 text-sm font-medium">DKIM</th>
                      <th className="text-center px-4 py-2 text-sm font-medium">DMARC</th>
                      <th className="text-center px-4 py-2 text-sm font-medium">Health</th>
                      <th className="text-right px-4 py-2 text-sm font-medium">Last Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{d.domain}</td>
                        <td className="text-center px-4 py-2">
                          <span className={d.spf_pass ? 'text-green-600' : 'text-red-600'}>
                            {d.spf_pass ? '✓' : '✗'}
                          </span>
                        </td>
                        <td className="text-center px-4 py-2">
                          <span className={d.dkim_pass ? 'text-green-600' : 'text-red-600'}>
                            {d.dkim_pass ? '✓' : '✗'}
                          </span>
                        </td>
                        <td className="text-center px-4 py-2">
                          <span className={d.dmarc_pass ? 'text-green-600' : 'text-red-600'}>
                            {d.dmarc_pass ? '✓' : '✗'}
                          </span>
                        </td>
                        <td className="text-center px-4 py-2">
                          <span className={`font-semibold ${d.health_score >= 67 ? 'text-green-600' : d.health_score >= 33 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {Math.round(d.health_score)}
                          </span>
                        </td>
                        <td className="text-right px-4 py-2 text-xs text-gray-500">
                          {d.last_checked
                            ? new Date(d.last_checked).toLocaleDateString()
                            : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 pt-2">
            Tip: All three records passing keeps your campaigns out of spam. Missing records will reduce deliverability.
          </p>
        </CardContent>
      </Card>

      {/* Warm-up Section */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Warm‑up</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {warmups.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No warm-up states configured. Warm-up is automatically started when you begin sending.
              </div>
            ) : (
              warmups.map((w) => (
                <div
                  key={w.id}
                  className="rounded border p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{w.account_email}</div>
                    <div className="text-sm text-muted-foreground">
                      Cap today: {w.daily_cap} • Day {w.day_index}
                    </div>
                  </div>
                  <form action="/api/warmup/toggle" method="post">
                    <input type="hidden" name="id" value={w.id} />
                    <Button
                      type="submit"
                      variant={w.paused ? 'default' : 'outline'}
                    >
                      {w.paused ? 'Resume' : 'Pause'}
                    </Button>
                  </form>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bounce Events Section */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Bounce Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hard bounces are automatically suppressed. View recent bounces in the logs.
          </p>
        </CardContent>
      </Card>

      {/* Suppression List Section */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Suppression List</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Suppressed emails are automatically excluded from sending. Manage suppressions in the suppression settings.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
