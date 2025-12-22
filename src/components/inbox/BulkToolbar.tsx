'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function BulkToolbar({ selectedIds, onDone }:{
  selectedIds: string[], onDone: ()=>void
}) {
  const [loading, setLoading] = useState(false)
  const [snooze, setSnooze] = useState<string>('')

  async function run(status: 'replied'|'archived'|'snoozed'|'open') {
    setLoading(true)
    try {
      const r = await fetch('/api/threads/bulk-status', {
        method: 'POST', 
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          thread_ids: selectedIds,
          status,
          snooze_until: status === 'snoozed' && snooze ? new Date(snooze).toISOString() : null
        })
      })
      if (r.ok) {
        onDone()
      }
    } catch (error) {
      console.error('Bulk update error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 flex items-center gap-2">
      <div className="text-sm">{selectedIds.length} selected</div>
      <Button size="sm" variant="secondary" onClick={()=>run('replied')} disabled={loading}>
        Mark replied
      </Button>
      <Button size="sm" variant="secondary" onClick={()=>run('archived')} disabled={loading}>
        Archive
      </Button>
      <div className="flex items-center gap-2">
        <Input 
          type="datetime-local" 
          value={snooze} 
          onChange={e=>setSnooze(e.target.value)} 
          className="h-8 w-56" 
        />
        <Button 
          size="sm" 
          variant="secondary" 
          onClick={()=>run('snoozed')} 
          disabled={loading || !snooze}
        >
          Snooze
        </Button>
      </div>
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={()=>run('open')} disabled={loading}>
          Reopen
        </Button>
      </div>
    </div>
  )
}

