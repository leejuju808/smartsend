'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

export function InboxBulkToolbar({ selectedIds, campaignId, onDone }: {
  selectedIds: string[]
  campaignId?: string
  onDone: () => void
}) {
  const [label, setLabel] = useState<'positive' | 'neutral' | 'negative' | 'ooh' | 'unsubscribe' | 'bounce' | 'unknown'>('unknown')
  const [loading, setLoading] = useState(false)

  const act = async (action: string, extra?: any) => {
    setLoading(true)
    try {
      const r = await fetch('/api/inbox/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, messageIds: selectedIds, campaignId, ...extra })
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Action failed')
      }
      onDone()
    } catch (e) {
      console.error('Bulk action error:', e)
      alert((e as Error).message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 p-2 border-b bg-background">
      <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
      <Button
        variant="outline"
        size="sm"
        disabled={!selectedIds.length || loading}
        onClick={() => act('mark_not_reply')}
      >
        Mark NOT a reply
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!selectedIds.length || loading}
        onClick={() => act('requeue')}
      >
        Requeue next step
      </Button>
      <div className="flex items-center gap-2">
        <Select value={label} onValueChange={(v: any) => setLabel(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Set label" />
          </SelectTrigger>
          <SelectContent>
            {['positive', 'neutral', 'negative', 'ooh', 'unsubscribe', 'bounce', 'unknown'].map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!selectedIds.length || loading}
          size="sm"
          onClick={() => act('set_label', { label })}
        >
          Apply Label
        </Button>
      </div>
    </div>
  )
}

