'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'

export function SequenceOptimizer({ 
  sequenceId, 
  ownerScope, 
  ownerId 
}: {
  sequenceId: string
  ownerScope: 'user' | 'org'
  ownerId: string
}) {
  const [variants, setVariants] = useState(2)
  const [spamSafe, setSpamSafe] = useState(true)
  const [spintax, setSpintax] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/sequences/${sequenceId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          owner_scope: ownerScope, 
          owner_id: ownerId, 
          variant_count: variants, 
          spam_safety: spamSafe, 
          spintax 
        })
      })
      
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Optimization failed' }))
        setError(err.error || 'Optimization failed')
        return
      }

      const data = await r.json()
      const allOk = data.results?.every((r: any) => r.ok) ?? false
      
      if (allOk) {
        window.location.reload()
      } else {
        setError('Some steps failed to optimize. Check console for details.')
        console.error('Optimization results:', data.results)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to optimize')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="font-medium">Optimize all steps</div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm">Variants</span>
          <Input 
            type="number" 
            className="w-20" 
            min={1}
            max={5}
            value={variants} 
            onChange={e => setVariants(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} 
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={spamSafe} onCheckedChange={setSpamSafe} />
          <span className="text-sm">Spam-safe</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={spintax} onCheckedChange={setSpintax} />
          <span className="text-sm">Spintax</span>
        </div>
        <Button onClick={run} disabled={busy}>
          {busy ? 'Optimizing…' : 'Run optimizer'}
        </Button>
      </div>
    </div>
  )
}

