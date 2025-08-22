"use client"
import { useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { useToast } from '@/components/toast/ToastProvider'

type Step = { subject: string; body: string; delayDays: number }

export default function NewSequencePage() {
  const sb = createClientComponentClient()
  const [steps, setSteps] = useState<Step[]>([
    { subject: '', body: '', delayDays: 0 },
    { subject: '', body: '', delayDays: 3 },
    { subject: '', body: '', delayDays: 7 },
  ])
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const { addToast } = useToast()

  const validate = () => {
    const hasUnsub = steps.every(s => s.body.includes('%UNSUB%'))
    if (!hasUnsub) return 'Each step must include %UNSUB% token'
    if (!address.trim()) return 'Physical mailing address is required'
    return null
  }

  const save = async () => {
    setError(null)
    const v = validate()
    if (v) { setError(v); addToast({ variant: 'error', title: 'Validation error', description: v }); return }
    setSaving(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); setError('Unauthorized'); addToast({ variant: 'error', title: 'Unauthorized' }); return }
    const payload = {
      user_id: user.id,
      status: 'draft',
      address,
      steps,
    }
    const { data, error } = await sb.from('sequences').insert(payload).select('id').single()
    if (error) { setError('Failed to save'); setSaving(false); addToast({ variant: 'error', title: 'Failed to save sequence' }); return }
    const id = (data as any)?.id
    await sb.from('sequences').update({ status: 'running' }).eq('id', id)
    // Onboarding flag
    await sb.from('onboarding_progress').upsert({ user_id: user.id, launched_sequence: true }, { onConflict: 'user_id' })
    setOk(true)
    addToast({ variant: 'success', title: 'Sequence started', description: 'Your sequence is now running.' })
    setSaving(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">New Sequence</h1>
      <p className="text-sm text-gray-600 mb-6">Create a 3-step sequence. Include %UNSUB% and a physical address.</p>

      <div className="space-y-6">
        {steps.map((s, i)=> (
          <div key={i} className="border rounded-lg p-4 bg-white">
            <div className="font-medium mb-2">Step {i+1}</div>
            <input className="w-full border rounded p-2 text-sm mb-2" placeholder="Subject" value={s.subject} onChange={e=>setSteps(arr=>{ const c=[...arr]; c[i]={...c[i], subject: e.target.value}; return c })} />
            <textarea className="w-full border rounded p-2 text-sm" rows={6} placeholder="Body (must include %UNSUB%)" value={s.body} onChange={e=>setSteps(arr=>{ const c=[...arr]; c[i]={...c[i], body: e.target.value}; return c })} />
            <div className="mt-2">
              <label className="text-sm mr-2">Delay (days)</label>
              <input className="border rounded p-2 text-sm w-24" value={s.delayDays} onChange={e=>setSteps(arr=>{ const c=[...arr]; c[i]={...c[i], delayDays: Number(e.target.value)||0}; return c })} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <input className="w-full border rounded p-2 text-sm" placeholder="Physical mailing address" value={address} onChange={e=>setAddress(e.target.value)} />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button disabled={saving} onClick={save} className="px-3 py-2 bg-black text-white rounded-md text-sm">{saving ? 'Saving…' : 'Save & Start'}</button>
        {error && <span className="text-sm text-red-700">{error}</span>}
        {ok && <span className="text-sm text-green-700">Sequence started</span>}
      </div>
    </div>
  )
}

