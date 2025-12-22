'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export function StepOptimizer({ 
  step,
  ownerScope,
  ownerId
}: { 
  step: { 
    id: string
    subject_template: string | null
    body_md: string | null
    step_number: number
  }
  ownerScope: 'user' | 'org'
  ownerId: string
}) {
  const [subject, setSubject] = useState(step.subject_template || '')
  const [body, setBody] = useState(step.body_md || '')
  const [variants, setVariants] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSubject(step.subject_template || '')
    setBody(step.body_md || '')
  }, [step])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/sequences/steps/${step.id}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_scope: ownerScope,
          owner_id: ownerId,
          subject,
          body_md: body,
          params: {
            tone: step.step_number === 1 ? 'punchy' : 'professional',
            length: step.step_number <= 2 ? 'short' : 'medium',
            persona: 'founder',
            variant_count: 3,
            spam_safety: true,
            add_unsubscribe: step.step_number >= 3
          }
        })
      })

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Generation failed' }))
        setError(err.error || 'Failed to generate variants')
        return
      }

      const j = await r.json()
      setVariants(j.versions || [])
    } catch (err: any) {
      setError(err.message || 'Failed to generate variants')
    } finally {
      setBusy(false)
    }
  }

  const apply = async (v: any) => {
    try {
      const r = await fetch(`/api/sequences/steps/${step.id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject_template: v.subject || '', 
          body_md: v.body_md 
        })
      })

      if (r.ok) {
        window.location.reload()
      } else {
        const err = await r.json().catch(() => ({ error: 'Update failed' }))
        setError(err.error || 'Failed to apply variant')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply variant')
    }
  }

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="text-sm font-medium">Step {step.step_number}</div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
      )}
      <Input 
        placeholder="Subject" 
        value={subject} 
        onChange={e => setSubject(e.target.value)} 
      />
      <Textarea 
        rows={5} 
        value={body} 
        onChange={e => setBody(e.target.value)}
        placeholder="Body (markdown, supports {{variables}})"
      />
      <Button onClick={generate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate variants'}
      </Button>
      {variants.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3 mt-3 max-h-80 overflow-auto">
          {variants.map((v: any) => (
            <div key={v.id} className="border rounded p-2 text-sm space-y-2">
              {v.subject && (
                <div className="font-medium mb-1 text-xs text-gray-600">Subject:</div>
              )}
              {v.subject && (
                <div className="font-medium mb-1">{v.subject}</div>
              )}
              <div className="text-xs text-gray-600 mb-1">Body:</div>
              <pre className="whitespace-pre-wrap text-xs font-mono bg-gray-50 p-2 rounded max-h-32 overflow-auto">
                {v.body_md}
              </pre>
              <div className="mt-2">
                <Button size="sm" onClick={() => apply(v)}>Use this</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

