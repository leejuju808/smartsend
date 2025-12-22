'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { toast } from 'sonner'

export default function ExperimentSplit({ 
  campaignId, 
  templateId 
}: {
  campaignId: string; 
  templateId: string
}) {
  const sb = supabaseBrowser()
  const [variants, setVariants] = useState<any[]>([])
  const [alloc, setAlloc] = useState<Record<string, number>>({}) // variant_id -> pct

  useEffect(() => {
    (async () => {
      const { data } = await sb.from('template_variants').select('id,label,subject').eq('template_id', templateId)
      setVariants(data || [])
      const init: Record<string, number> = {}
      ;(data || []).forEach((v:any) => init[v.id] = Math.floor(100/(data?.length||1)))
      setAlloc(init)
    })()
  }, [templateId])

  const saveSplit = async () => {
    const sum = Object.values(alloc).reduce((a,b)=>a+b,0)
    if (sum !== 100) { 
      toast.error('Split must total 100%'); 
      return 
    }
    const { data: user } = await sb.auth.getUser()
    // upsert experiment and allocations
    const { data: exp, error: e1 } = await sb.from('campaign_experiments')
      .insert({ user_id: user.data.user?.id, campaign_id: campaignId, template_id: templateId })
      .select('id').single()
    if (e1) { 
      toast.error(e1.message); 
      return 
    }
    const rows = Object.entries(alloc).map(([variant_id, pct]) => ({ experiment_id: exp.id, variant_id, pct }))
    const { error: e2 } = await sb.from('experiment_allocations').insert(rows)
    if (e2) { 
      toast.error(e2.message); 
      return 
    }
    toast.success('Experiment split saved')
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Distribute 100% across variants</div>
      {variants.map(v => (
        <div key={v.id} className="flex items-center gap-2">
          <div className="w-40 truncate">{v.label}</div>
          <Input
            type="number" 
            min={0} 
            max={100}
            value={alloc[v.id] ?? 0}
            onChange={e=>setAlloc(prev => ({...prev, [v.id]: Number(e.target.value)}))}
            className="w-24"
          />
          <span className="text-sm">%</span>
        </div>
      ))}
      <Button onClick={saveSplit}>Save Split</Button>
      <div className="text-xs text-muted-foreground">
        Tip: Start 80/20 (Control/Variant), expand once Variant wins.
      </div>
    </div>
  )
}

