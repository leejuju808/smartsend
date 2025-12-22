'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

const TZ = ['America/Los_Angeles','America/New_York','Europe/London','UTC'] as const

export function SendWindow({ campaignId }: { campaignId: string }) {
  const [tz, setTz] = useState('America/Los_Angeles')
  const [start, setStart] = useState<string>('08:30')
  const [end, setEnd] = useState<string>('11:30')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/campaigns/${campaignId}`)
      if (!r.ok) return
      const { campaign } = await r.json()
      setTz(campaign?.tz ?? 'America/Los_Angeles')
      setStart(campaign?.send_window_start ?? '08:30')
      setEnd(campaign?.send_window_end ?? '11:30')
    })()
  }, [campaignId])

  async function save() {
    setSaving(true)
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tz, send_window_start: start, send_window_end: end })
    })
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Send Window</div>
      <div className="flex gap-2">
        <Input type="time" value={start} onChange={e => setStart(e.target.value)} className="w-32" />
        <Input type="time" value={end} onChange={e => setEnd(e.target.value)} className="w-32" />
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Timezone" /></SelectTrigger>
          <SelectContent>
            {TZ.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Emails only send when local time is within this window. Outside the window, they wait until the next open.
      </p>
    </div>
  )
}

