'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, Calendar, Phone, Mail, MapPin, TrendingUp } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase'

interface StormPipelineViewProps {
  workspaceId: string
  stormEventId?: string
}

interface StormLead {
  id: string
  lead_id: string
  storm_event_id: string
  urgency_score: number
  classification: string | null
  created_at: string
  lead: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    zip_code: string | null
    score: number | null
    status: string | null
  }
  storm_event: {
    id: string
    zip_code: string
    event_type: string
    severity: number
    detected_at: string
    metadata?: any
  }
}

const PIPELINE_COLUMNS = [
  { id: 'new_damage', label: 'NEW DAMAGE', color: 'bg-red-500' },
  { id: 'inspection_pending', label: 'INSPECTION REQUEST', color: 'bg-orange-500' },
  { id: 'insurance_process', label: 'INSURANCE PROCESS', color: 'bg-yellow-500' },
  { id: 'contract_ready', label: 'CONTRACT READY', color: 'bg-blue-500' },
  { id: 'completed', label: 'COMPLETED', color: 'bg-green-500' },
]

export function StormPipelineView({ workspaceId, stormEventId }: StormPipelineViewProps) {
  const [stormLeads, setStormLeads] = useState<StormLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function loadStormLeads() {
      try {
        const url = new URL('/api/storms/leads', window.location.origin)
        url.searchParams.set('workspace_id', workspaceId)
        if (stormEventId) {
          url.searchParams.set('storm_event_id', stormEventId)
        }

        const response = await fetch(url.toString())
        if (response.ok) {
          const data = await response.json()
          setStormLeads(data.storm_leads || [])
        }
      } catch (error) {
        console.error('Error loading storm leads:', error)
      } finally {
        setLoading(false)
      }
    }

    if (workspaceId) {
      loadStormLeads()
      // Refresh every 2 minutes during storm mode
      const interval = setInterval(loadStormLeads, 2 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [workspaceId, stormEventId])

  // Map classifications to pipeline columns
  const getLeadColumn = (lead: StormLead): string => {
    const classification = lead.classification
    const status = lead.lead.status

    if (status === 'closed_won' || status === 'completed') return 'completed'
    if (status === 'contract_sent' || status === 'proposal_accepted') return 'contract_ready'
    if (classification === 'insurance_claim') return 'insurance_process'
    if (classification === 'inspection_request') return 'inspection_pending'
    if (classification === 'storm_damage' || classification === 'emergency_leak') return 'new_damage'

    // Default based on score
    if (lead.urgency_score >= 70) return 'new_damage'
    if (lead.urgency_score >= 50) return 'inspection_pending'
    return 'new_damage'
  }

  // Group leads by column
  const leadsByColumn = PIPELINE_COLUMNS.reduce((acc, col) => {
    acc[col.id] = stormLeads.filter(lead => getLeadColumn(lead) === col.id)
    return acc
  }, {} as Record<string, StormLead[]>)

  const formatScore = (score: number | null) => {
    if (score === null) return 'N/A'
    const color = score >= 80 ? 'text-red-600' : score >= 50 ? 'text-orange-600' : 'text-yellow-600'
    return <span className={`font-bold ${color}`}>{score}</span>
  }

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'hail':
        return '🌨️'
      case 'wind':
        return '💨'
      case 'rain':
        return '🌧️'
      case 'ice':
        return '🧊'
      case 'tree_impact':
        return '🌳'
      default:
        return '⚡'
    }
  }

  const getSeverityColor = (severity: number) => {
    if (severity >= 8) return 'bg-red-500'
    if (severity >= 5) return 'bg-orange-500'
    return 'bg-yellow-500'
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading storm pipeline...
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">STORM PIPELINE</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {stormLeads.length} storm lead{stormLeads.length !== 1 ? 's' : ''} across {PIPELINE_COLUMNS.length} stages
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto">
        {PIPELINE_COLUMNS.map((column) => {
          const leads = leadsByColumn[column.id] || []
          const isSelected = selectedColumn === column.id

          return (
            <Card
              key={column.id}
              className={`p-4 min-w-[250px] ${isSelected ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">{column.label}</h3>
                <Badge className={`${column.color} text-white`}>{leads.length}</Badge>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {leads.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No leads
                  </div>
                ) : (
                  leads.map((stormLead) => (
                    <Card
                      key={stormLead.id}
                      className="p-3 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setSelectedColumn(selectedColumn === column.id ? null : column.id)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {stormLead.lead.first_name} {stormLead.lead.last_name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {stormLead.lead.email}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold">
                              {formatScore(stormLead.lead.score)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              +{stormLead.urgency_score}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {stormLead.classification && (
                            <Badge variant="outline" className="text-xs">
                              {stormLead.classification.replace('_', ' ')}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${getSeverityColor(stormLead.storm_event.severity)} text-white`}
                          >
                            {getEventTypeIcon(stormLead.storm_event.event_type)} {stormLead.storm_event.event_type}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {stormLead.lead.zip_code && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {stormLead.lead.zip_code}
                            </div>
                          )}
                          {stormLead.lead.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {stormLead.lead.phone}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-1 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              window.open(`/dashboard/leads/${stormLead.lead.id}`, '_blank')
                            }}
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            View Lead
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1 text-xs bg-orange-500 hover:bg-orange-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              // Navigate to booking/inspection scheduling
                              window.open(`/dashboard/bookings/new?lead_id=${stormLead.lead.id}`, '_blank')
                            }}
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            Book
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}


































