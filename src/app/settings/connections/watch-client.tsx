'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function WatchClient() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<'start'|'stop'|null>(null)
  const [msg, setMsg] = useState<string>('')

  const call = async (path: string, label: 'start'|'stop') => {
    setLoading(label); setMsg('')
    const r = await fetch(path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email }) })
    const j = await r.json()
    setLoading(null)
    setMsg(r.ok ? `OK: ${JSON.stringify(j)}` : `Error: ${j.error || 'failed'}`)
  }

  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Email Connections</h1>
      <div className="space-y-2">
        <label className="text-sm">Gmail address</label>
        <Input placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => call('/api/gmail/watch/start','start')} disabled={!email || !!loading}>
          {loading==='start' ? 'Starting…' : 'Start Watch'}
        </Button>
        <Button onClick={() => call('/api/gmail/watch/stop','stop')} disabled={!email || !!loading}>
          {loading==='stop' ? 'Stopping…' : 'Stop Watch'}
        </Button>
      </div>
      {msg && <div className="text-sm text-muted-foreground break-all">{msg}</div>}
    </div>
  )
}

