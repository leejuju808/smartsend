'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false)
  
  async function launch() {
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/launch`, { method: 'POST' })
      const j = await r.json()
      
      if (r.ok) {
        // toast.success(`Enqueued ${j.enqueued} emails`)
        console.log(`Enqueued ${j.enqueued} emails`)
      } else {
        // toast.error(j.error || 'Failed to launch')
        console.error(j.error || 'Failed to launch')
      }
    } catch (error) {
      console.error('Launch error:', error)
      // toast.error('Failed to launch')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Button onClick={launch} disabled={loading}>
      {loading ? 'Launching…' : 'Launch'}
    </Button>
  )
}
