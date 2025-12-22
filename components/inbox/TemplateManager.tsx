'use client';
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TemplateManager({ userId }: { userId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body_html, setBodyHtml] = useState('<p></p>')

  async function load() {
    const r = await fetch(`/api/email-templates?userId=${userId}`)
    const d = await r.json()
    setItems(d.items || [])
  }
  useEffect(() => { load() }, [])

  async function save() {
    const r = await fetch('/api/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name, subject, body_html }) })
    if (r.ok) { setOpen(false); setName(''); setSubject(''); setBodyHtml('<p></p>'); load() }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div className="font-medium">Templates</div>
        <Button size="sm" onClick={()=>setOpen(true)}>New</Button>
      </div>
      <ul className="text-sm list-disc pl-5">
        {items.map(i => (<li key={i.id}>{i.name} — <span className="text-muted-foreground">{i.subject}</span></li>))}
      </ul>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-background rounded-xl p-4 w-[520px] space-y-2">
            <div className="text-lg font-semibold">New Template</div>
            <input className="w-full border rounded px-2 py-1" placeholder="Name" value={name} onChange={(e)=>setName(e.target.value)} />
            <input className="w-full border rounded px-2 py-1" placeholder="Subject" value={subject} onChange={(e)=>setSubject(e.target.value)} />
            <textarea className="w-full h-40 border rounded px-2 py-1" value={body_html} onChange={(e)=>setBodyHtml(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


