'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { toast } from 'sonner'

export default function VariantGenerator({ 
  templateId, 
  baseSubject, 
  baseBody 
}: {
  templateId: string; 
  baseSubject: string; 
  baseBody: string
}) {
  const sb = supabaseBrowser()
  const [count, setCount] = useState(2)
  const [tone, setTone] = useState<'concise'|'friendly'|'direct'|'curious'|'authoritative'>('concise')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<any[]>([])

  const run = async () => {
    setBusy(true)
    const { data: user } = await sb.auth.getUser()
    try {
      const res = await fetch('/functions/v1/smart_rewrite', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.data.user?.id,
          template_id: templateId,
          base_subject: baseSubject,
          base_body: baseBody,
          variant_count: count,
          tone,
          constraints: { max_words: 130, keep_tokens: ['{{first_name}}','{{company}}'] }
        })
      })
      if (!res.ok) throw new Error('Rewrite failed')
      const j = await res.json()
      setOut(j.variants || [])
      toast.success('Variants generated')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input 
          type="number" 
          min={1} 
          max={5} 
          value={count} 
          onChange={e=>setCount(Number(e.target.value))} 
          className="w-24"
        />
        <select 
          className="border rounded-md px-2" 
          value={tone} 
          onChange={e=>setTone(e.target.value as any)}
        >
          <option value="concise">Concise</option>
          <option value="friendly">Friendly</option>
          <option value="direct">Direct</option>
          <option value="curious">Curious</option>
          <option value="authoritative">Authoritative</option>
        </select>
        <Button onClick={run} disabled={busy}>
          {busy ? 'Generating…' : 'Generate Variants'}
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {out.map((v) => (
          <div key={v.id} className="border rounded-xl p-3">
            <div className="text-sm font-medium mb-2">{v.label}</div>
            <div className="text-sm mb-1">
              <span className="font-semibold">Subject:</span> {v.subject}
            </div>
            <Textarea readOnly rows={6} value={v.body} />
          </div>
        ))}
      </div>
    </div>
  )
}

