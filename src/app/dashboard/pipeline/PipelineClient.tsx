"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

type Contact = {
  id: string
  email: string
  first_name?: string
  last_name?: string
  company?: string
  created_at: string
  pipeline_stage_id?: string
}

type PipelineStage = {
  id: string
  name: string
  order_index: number
  contacts: Contact[]
}

export default function PipelineClient() {
  const supabase = createClientComponentClient()
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    const loadDefaultPipeline = async () => {
      try {
        const response = await fetch('/api/pipeline/default')
        if (response.ok) {
          const pipeline = await response.json()
          setPipelineId(pipeline.id)
        }
      } catch (error) {
        console.error('Failed to load default pipeline:', error)
      }
    }
    loadDefaultPipeline()
  }, [])

  useEffect(() => {
    const loadStages = async () => {
      if (!pipelineId) return
      
      try {
        const response = await fetch(`/api/pipeline/${pipelineId}/stages`)
        if (response.ok) {
          const data = await response.json()
          setStages(data)
        }
      } catch (error) {
        console.error('Failed to load stages:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadStages()
  }, [pipelineId])

  const moveContact = async (contactId: string, newStageId: string) => {
    try {
      const response = await fetch(`/api/contacts/${contactId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId })
      })
      
      if (response.ok) {
        // Reload stages to get updated data
        if (pipelineId) {
          const response = await fetch(`/api/pipeline/${pipelineId}/stages`)
          if (response.ok) {
            const data = await response.json()
            setStages(data)
          }
        }
      }
    } catch (error) {
      console.error('Failed to move contact:', error)
    }
  }

  const onDrop = async (contactId: string, newStageId: string) => {
    await moveContact(contactId, newStageId)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading pipeline…</div>
  if (!pipelineId) return <div className="text-sm text-gray-500">No pipeline found</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Jobs Pipeline</h1>
      <div className="text-sm text-gray-600 mb-4">Hot → Booked → Closed</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-x-auto">
        {stages.map(stage => (
          <Column
            key={stage.id}
            title={stage.name}
            items={stage.contacts || []}
            onDrop={(id) => onDrop(id, stage.id)}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            onMoveContact={moveContact}
            allStages={stages}
          />
        ))}
      </div>
    </div>
  )
}

function Column({ 
  title, 
  items, 
  onDrop, 
  draggingId, 
  setDraggingId,
  onMoveContact,
  allStages
}: {
  title: string
  items: Contact[]
  onDrop: (id: string) => void
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  onMoveContact: (contactId: string, stageId: string) => Promise<void>
  allStages: PipelineStage[]
}) {
  return (
    <div
      className="bg-white rounded-lg border p-3 min-h-[300px] min-w-[250px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDrop(id)
      }}
    >
      <div className="text-sm font-semibold mb-3 text-gray-700">
        {title} <span className="text-gray-400">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map(contact => (
          <Card 
            key={contact.id} 
            contact={contact} 
            draggingId={draggingId} 
            setDraggingId={setDraggingId}
            onMoveContact={onMoveContact}
            allStages={allStages}
          />
        ))}
      </div>
    </div>
  )
}

function Card({ 
  contact, 
  draggingId, 
  setDraggingId,
  onMoveContact,
  allStages
}: {
  contact: Contact
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  onMoveContact: (contactId: string, stageId: string) => Promise<void>
  allStages: PipelineStage[]
}) {
  const displayName = contact.first_name && contact.last_name 
    ? `${contact.first_name} ${contact.last_name}`
    : contact.first_name || contact.last_name || contact.email.split('@')[0]

  return (
    <div
      draggable
      onDragStart={(e) => {
        setDraggingId(contact.id)
        e.dataTransfer.setData('text/plain', contact.id)
      }}
      onDragEnd={() => setDraggingId(null)}
      className={`bg-white border rounded-lg p-3 cursor-move hover:shadow-sm transition-shadow ${
        draggingId === contact.id ? 'opacity-50' : ''
      }`}
    >
      <div className="font-medium text-sm text-gray-900">{displayName}</div>
      <div className="text-xs text-gray-500 mt-1">{contact.email}</div>
      {contact.company && (
        <div className="text-xs text-gray-500 mt-1">{contact.company}</div>
      )}
      
      {/* Stage selector dropdown */}
      <select 
        className="mt-2 w-full text-xs border rounded p-1 bg-gray-50"
        value={contact.pipeline_stage_id || ''}
        onChange={(e) => onMoveContact(contact.id, e.target.value)}
      >
        {allStages.map(stage => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
    </div>
  )
} 