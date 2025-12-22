'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/Card'

export function SmartWindowsCard({ campaignId }: { campaignId: string }) {
  const [useLocal, setUseLocal] = useState(false)
  const [fallbackTz, setFallbackTz] = useState<string>('')
  const [skipWeekends, setSkipWeekends] = useState(true)
  const [skipHolidays, setSkipHolidays] = useState(true)
  const [fallbackCountry, setFallbackCountry] = useState<string>('US')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/campaigns/${campaignId}`)
      if (!r.ok) return
      const j = await r.json()
      const campaign = j?.campaign
      if (campaign) {
        setUseLocal(Boolean(campaign.use_lead_local_time))
        setFallbackTz(campaign.fallback_timezone || '')
        setSkipWeekends(campaign.skip_weekends ?? true)
        setSkipHolidays(campaign.skip_holidays ?? true)
        setFallbackCountry(campaign.fallback_country || 'US')
      }
    })()
  }, [campaignId])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/windows`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          use_lead_local_time: useLocal,
          fallback_timezone: fallbackTz || null,
          skip_weekends: skipWeekends,
          skip_holidays: skipHolidays,
          fallback_country: fallbackCountry || null
        })
      })
      if (!r.ok) {
        const j = await r.json()
        alert(j.error || 'Save failed')
        return
      }
      alert('Saved')
    } finally {
      setSaving(false)
    }
  }

  async function rebucket() {
    const r = await fetch(`/api/campaigns/${campaignId}/queue/rebucket`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 2000 })
    })
    const j = await r.json()
    if (!r.ok) return alert(j.error || 'Rebucket failed')
    alert(`Shifted ${j.shifted} queued emails to the next business window`)
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Smart Windows</div>
      
      <div className="flex items-center gap-2">
        <Checkbox checked={useLocal} onCheckedChange={v => setUseLocal(Boolean(v))} />
        <Label className="text-xs">Schedule in each lead's local time</Label>
      </div>

      {useLocal && (
        <div className="grid gap-2">
          <Label className="text-xs">Fallback timezone (IANA, e.g., America/New_York)</Label>
          <Input
            placeholder="America/New_York"
            value={fallbackTz}
            onChange={e => setFallbackTz(e.target.value)}
            className="w-full"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox checked={skipWeekends} onCheckedChange={v => setSkipWeekends(Boolean(v))} />
          <Label className="text-xs">Skip weekends</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={skipHolidays} onCheckedChange={v => setSkipHolidays(Boolean(v))} />
          <Label className="text-xs">Skip holidays</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Default country</Label>
          <Input
            className="w-40"
            placeholder="ISO-2 (e.g., US)"
            value={fallbackCountry}
            onChange={e => setFallbackCountry(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="secondary" onClick={rebucket}>
          Shift queued to business days
        </Button>
      </div>
    </Card>
  )
}

