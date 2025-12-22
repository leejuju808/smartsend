'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/toast/ToastProvider'

export default function SendingProfilesPage(){
  const sb = createClient()
  const { push } = useToast()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [form, setForm] = useState<any>({ name:'', provider:'smtp', from_name:'', from_email:'', signature_html:'' })
  const [secrets, setSecrets] = useState<any>({})

  // Load user's project
  useEffect(() => {
    async function loadProject() {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      
      const { data } = await sb
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle()
      
      if (data) {
        setProjectId(data.project_id)
      }
    }
    loadProject()
  }, [sb])

  async function load(){
    if (!projectId) return
    const { data } = await sb.from('sending_profiles').select('*').eq('project_id', projectId).order('created_at',{ascending:false})
    setProfiles(data||[])
  }
  
  useEffect(()=>{ load() },[projectId])

  async function createProfile(){
    if (!projectId) return
    const { data, error } = await sb.from('sending_profiles').insert({ project_id: projectId, ...form }).select('id').single()
    if (error) {
      push({ title: 'Error', description: 'Create failed', type: 'error' })
      return
    }
    const pid = data.id
    // secrets saved through edge function
    const res = await fetch('/functions/v1/upsert-profile', {
      method:'POST', 
      body: JSON.stringify({ profile_id: pid, provider: form.provider, secrets }),
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res.ok) {
      push({ title: 'Error', description: 'Secrets save failed', type: 'error' })
    } else {
      push({ title: 'Success', description: 'Profile created', type: 'success' })
    }
    setForm({ name:'', provider:'smtp', from_name:'', from_email:'', signature_html:'' })
    setSecrets({})
    load()
  }

  async function setDefault(id:string){
    if (!projectId) return
    const { error } = await sb.from('projects').update({ default_sending_profile:id }).eq('id', projectId)
    if (error) {
      push({ title: 'Error', description: 'Failed to set default', type: 'error' })
    } else {
      push({ title: 'Success', description: 'Default set', type: 'success' })
      load()
    }
  }

  if (!projectId) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Sending Profiles</h1>

      <div className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input className="border p-2 rounded" placeholder="Profile name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <select className="border p-2 rounded" value={form.provider} onChange={e=>{ setForm({...form,provider:e.target.value}); setSecrets({}) }}>
            <option value="smtp">SMTP</option>
            <option value="resend">Resend</option>
            <option value="sendgrid">Sendgrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="postmark">Postmark</option>
          </select>
          <input className="border p-2 rounded" placeholder="From name" value={form.from_name} onChange={e=>setForm({...form,from_name:e.target.value})}/>
          <input className="border p-2 rounded" placeholder="From email" value={form.from_email} onChange={e=>setForm({...form,from_email:e.target.value})}/>
        </div>
        <textarea className="border p-2 rounded w-full" rows={4} placeholder="Signature HTML (optional)"
          value={form.signature_html} onChange={e=>setForm({...form,signature_html:e.target.value})}/>
        {/* Secrets fields */}
        {form.provider==='smtp' && (
          <div className="grid grid-cols-2 gap-3">
            <input className="border p-2 rounded" placeholder="SMTP host" onChange={e=>setSecrets({...secrets,host:e.target.value})}/>
            <input className="border p-2 rounded" placeholder="SMTP port" type="number" onChange={e=>setSecrets({...secrets,port:e.target.value})}/>
            <input className="border p-2 rounded" placeholder="SMTP user" onChange={e=>setSecrets({...secrets,user:e.target.value})}/>
            <input className="border p-2 rounded" type="password" placeholder="SMTP pass" onChange={e=>setSecrets({...secrets,pass:e.target.value})}/>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" onChange={e=>setSecrets({...secrets,secure:e.target.checked})}/> TLS/SSL
            </label>
          </div>
        )}
        {form.provider!=='smtp' && (
          <div className="grid grid-cols-2 gap-3">
            <input className="border p-2 rounded" type="password" placeholder="API key" onChange={e=>setSecrets({...secrets,api_key:e.target.value})}/>
            <input className="border p-2 rounded" placeholder="Domain (optional)" onChange={e=>setSecrets({...secrets,domain:e.target.value})}/>
          </div>
        )}
        <div className="flex gap-2">
          <button className="border rounded px-3 py-2" onClick={createProfile}>Create profile</button>
        </div>
      </div>

      <div className="border rounded">
        <div className="p-3 font-semibold border-b">Profiles</div>
        {profiles.map(p=>(
          <div key={p.id} className="p-3 border-b flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-gray-500">{p.provider} — {p.from_name} &lt;{p.from_email}&gt;</div>
            </div>
            <div className="flex gap-2">
              <button className="text-xs border rounded px-2 py-1" onClick={()=>setDefault(p.id)}>Set default</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

