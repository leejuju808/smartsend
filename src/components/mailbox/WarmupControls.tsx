'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'

interface WarmupData {
  enabled: boolean
  started_at: string | null
  day: number | null
  daily_cap: number
}

interface HealthData {
  warmup: WarmupData
}

export function WarmupControls({ mailboxId }: { mailboxId: string }) {
  const [state, setState] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  
  const load = async () => {
    const r = await fetch(`/api/mailboxes/${mailboxId}/health`)
    if (r.ok) {
      const json = await r.json()
      setState(json)
    }
  }

  useEffect(() => {
    load()
  }, [mailboxId])

  const save = async (patch: any) => {
    setLoading(true)
    try {
      await fetch(`/api/mailboxes/${mailboxId}/warmup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      await load()
    } finally {
      setLoading(false)
    }
  }

  if (!state) return null

  return (
    <div className="rounded border p-4 space-y-3">
      <div className="font-medium">Warmup</div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Enable warmup ramp</span>
        <Switch 
          checked={state.warmup.enabled} 
          onCheckedChange={(v) => save({ enabled: v })}
          disabled={loading}
        />
      </div>
      <div className="flex items-center gap-2">
        <Input 
          type="number" 
          className="w-32" 
          defaultValue={state.warmup.daily_cap} 
          onBlur={(e) => save({ daily_cap: Number(e.currentTarget.value) })}
          disabled={loading}
        />
        <Button 
          variant="outline" 
          onClick={() => save({ start: true })}
          disabled={loading}
        >
          Start / Restart
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        Auto-pause kicks in if bounce ≥ 5% with ≥ 10 sends any of the last 3 days.
      </div>
    </div>
  )
}

