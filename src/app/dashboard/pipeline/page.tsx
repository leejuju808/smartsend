"use client"
import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

type Deal = {
  id: string
  name: string
  stage: 'Contacted'|'Replied'|'Demo Scheduled'|'Proposal Sent'|'Closed Won'|'Closed Lost'
  value: number | null
  contact_id: string | null
}

const STAGES: Deal['stage'][] = ['Contacted','Replied','Demo Scheduled','Proposal Sent','Closed Won','Closed Lost']

export default function PipelinePage() {
  const supabase = createClientComponentClient()
  const [deals, setDeals] = useState<Deal[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    const active = typeof window !== 'undefined' ? localStorage.getItem('active_workspace') : null
    setWorkspaceId(active)
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!workspaceId) { setLoading(false); return }
      const { data } = await supabase
        .from('deals')
        .select('id,name,stage,value,contact_id, contacts:contact_id(name,company,lead_score)')
        .eq('workspace_id', workspaceId)
      setDeals((data || []) as any)
      setLoading(false)
    }
    load()
  }, [supabase, workspaceId])

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {}
    for (const s of STAGES) map[s] = []
    for (const d of deals) (map[d.stage] ||= []).push(d)
    return map
  }, [deals])

  const onDrop = async (dealId: string, newStage: Deal['stage']) => {
    if (!workspaceId) return
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d))
    await supabase.from('deals').update({ stage: newStage }).eq('id', dealId)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading pipeline…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Pipeline</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAGES.map(stage => (
          <Column
            key={stage}
            title={stage}
            items={byStage[stage] || []}
            onDrop={(id) => onDrop(id, stage)}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
          />
        ))}
      </div>
    </div>
  )
}

function Column({ title, items, onDrop, draggingId, setDraggingId }: {
  title: string
  items: Deal[]
  onDrop: (id: string) => void
  draggingId: string | null
  setDraggingId: (id: string | null) => void
}) {
  return (
    <div
      className="bg-white rounded-lg border p-3 min-h-[300px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDrop(id)
      }}
    >
      <div className="text-sm font-semibold mb-2">{title} <span className="text-gray-400">({items.length})</span></div>
      <div className="space-y-2">
        {items.map(d => (
          <Card key={d.id} deal={d} draggingId={draggingId} setDraggingId={setDraggingId} />
        ))}
      </div>
    </div>
  )
}

function Card({ deal, draggingId, setDraggingId }: {
  deal: Deal
  draggingId: string | null
  setDraggingId: (id: string | null) => void
}) {
  const c: any = (deal as any).contacts || null
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id)
        setDraggingId(deal.id)
      }}
      onDragEnd={() => setDraggingId(null)}
      className={`rounded-md border p-3 bg-white shadow-sm cursor-move ${draggingId === deal.id ? 'opacity-70' : ''}`}
    >
      <div className="text-sm font-medium">{deal.name}</div>
      <div className="text-xs text-gray-500">{deal.value ? `$${Number(deal.value).toLocaleString()}` : '—'}</div>
      {c && (
        <div className="mt-1 text-xs text-gray-600">
          <div>{c.name || '-'}{c.company ? ` • ${c.company}` : ''}</div>
          {typeof c.lead_score === 'number' && <div>Score: {c.lead_score}</div>}
        </div>
      )}
    </div>
  )
}

