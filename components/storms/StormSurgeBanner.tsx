'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Zap, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { createClientComponentClient } from '@/lib/supabase'

interface StormSurgeBannerProps {
  workspaceId: string
}

interface StormFlag {
  workspace_id: string
  active: boolean
  last_triggered: string | null
  storm_events?: Array<{
    id: string
    zip_code: string
    event_type: string
    severity: number
    detected_at: string
    metadata?: any
  }>
}

export function StormSurgeBanner({ workspaceId }: StormSurgeBannerProps) {
  const [stormFlag, setStormFlag] = useState<StormFlag | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function loadStormFlag() {
      try {
        const response = await fetch(`/api/storms/flag?workspace_id=${workspaceId}`)
        if (response.ok) {
          const data = await response.json()
          setStormFlag(data)
        }
      } catch (error) {
        console.error('Error loading storm flag:', error)
      } finally {
        setLoading(false)
      }
    }

    if (workspaceId) {
      loadStormFlag()
      // Refresh every 5 minutes
      const interval = setInterval(loadStormFlag, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [workspaceId])

  if (loading || !stormFlag || !stormFlag.active) {
    return null
  }

  const stormCount = stormFlag.storm_events?.length || 0
  const affectedZips = new Set(stormFlag.storm_events?.map(e => e.zip_code) || []).size

  return (
    <div className="border-b bg-gradient-to-r from-orange-500/10 via-red-500/10 to-orange-500/10 border-orange-500/30 animate-pulse-slow">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Zap className="h-6 w-6 text-orange-500 animate-pulse" />
              <AlertTriangle className="h-4 w-4 text-red-500 absolute -top-1 -right-1" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                ⚡ STORM SURGE MODE ACTIVE — PRIORITIZE INBOUND LEADS NOW
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stormCount} active storm event{stormCount !== 1 ? 's' : ''} affecting {affectedZips} ZIP code{affectedZips !== 1 ? 's' : ''} • Expect 2–3× more inbound leads
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/storms/pipeline?workspace_id=${workspaceId}`}>
              <Button variant="default" size="sm" className="bg-orange-500 hover:bg-orange-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                View Storm Pipeline
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}


































