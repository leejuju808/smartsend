'use client'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import { useState } from 'react'

export function BulkEnrich({ 
  campaignId, 
  selectedIds, 
  onDone 
}: {
  campaignId: string, 
  selectedIds: string[], 
  onDone: ()=>void 
}) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  const go = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/enrichment/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          campaignId, 
          leadIds: selectedIds.length > 0 ? selectedIds : undefined 
        })
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Enqueue failed')
      }

      const json = await res.json()
      
      // Trigger the worker
      await fetch('/api/enrichment/run', { method: 'POST' })
      
      addToast({
        title: 'Enrichment queued',
        description: `Queued ${json.queued} lead(s) for enrichment.`,
      })
      
      onDone()
    } catch (e: any) {
      addToast({
        title: 'Enrichment failed',
        description: e.message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      onClick={go}
      disabled={loading}
    >
      {loading ? 'Enriching...' : 'Enrich'}
    </Button>
  )
}

