'use client'
import { useEffect, useState } from 'react'

export default function MeetingSettingsPage() {
  const profileId = 'USER_PROFILE_ID' // TODO: wire session
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(`/api/settings/meetings?profile_id=${profileId}`).then(r=>r.json()).then(d=>{
      if (d.calendly_url) setCalendlyUrl(d.calendly_url)
      if (d.timezone) setTimezone(d.timezone)
    })
  }, [])

  const save = async () => {
    setSaving(true); setMsg('')
    const res = await fetch('/api/settings/meetings', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ profile_id: profileId, calendly_url: calendlyUrl, timezone })
    })
    const d = await res.json()
    setSaving(false)
    setMsg(res.ok ? 'Saved!' : d.error || 'Error')
  }

  return (
    <div className="p-8 max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Meeting Settings</h1>
      <label className="block">
        <div className="text-sm text-gray-600 mb-1">Calendly URL (optional)</div>
        <input value={calendlyUrl} onChange={e=>setCalendlyUrl(e.target.value)} placeholder="https://calendly.com/your-handle/intro"
               className="w-full border rounded p-2"/>
      </label>
      <label className="block">
        <div className="text-sm text-gray-600 mb-1">Timezone</div>
        <input value={timezone} onChange={e=>setTimezone(e.target.value)} className="w-full border rounded p-2"/>
      </label>
      <button onClick={save} disabled={saving} className="bg-blue-600 text-white rounded px-4 py-2">
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && <div className="text-sm">{msg}</div>}
    </div>
  )
}
