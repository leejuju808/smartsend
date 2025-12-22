'use client'

import { useEffect, useState } from 'react'
import { Phone, Clock, TrendingUp, AlertCircle, CheckCircle2, XCircle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface CallTranscript {
  id: string
  call_timestamp: string
  duration_seconds: number
  call_direction: 'inbound' | 'outbound'
  caller_number: string
  called_number: string | null
  call_summary: string | null
  call_outcome: string | null
  job_type: string | null
  severity: string | null
  urgency: string | null
  insurance_involvement: boolean
  pipeline_action_taken: string[] | null
  coaching_tips: string[] | null
  estimated_job_value: number | null
  job_potential_score: number | null
  sentiment: string | null
  created_at: string
  processed_at: string | null
}

interface CallHistoryTabProps {
  threadId: string
}

export function CallHistoryTab({ threadId }: CallHistoryTabProps) {
  const [calls, setCalls] = useState<CallTranscript[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCallHistory()
  }, [threadId])

  async function fetchCallHistory() {
    try {
      setLoading(true)
      const response = await fetch(`/api/calls/thread/${threadId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch call history')
      }

      const data = await response.json()
      setCalls(data.calls || [])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load call history')
      console.error('Error fetching call history:', err)
    } finally {
      setLoading(false)
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function getOutcomeBadge(outcome: string | null) {
    if (!outcome) return null

    const outcomeConfig: Record<string, { label: string; variant: 'default' | 'success' | 'destructive' | 'secondary' }> = {
      appointment_scheduled: { label: 'Appointment Scheduled', variant: 'success' },
      appointment_requested: { label: 'Appointment Requested', variant: 'success' },
      estimate_requested: { label: 'Estimate Requested', variant: 'default' },
      pricing_discussed: { label: 'Pricing Discussed', variant: 'default' },
      insurance_mentioned: { label: 'Insurance Mentioned', variant: 'default' },
      storm_damage_confirmed: { label: 'Storm Damage Confirmed', variant: 'default' },
      interested: { label: 'Interested', variant: 'success' },
      hesitation: { label: 'Hesitation', variant: 'secondary' },
      thinking_about_it: { label: 'Thinking About It', variant: 'secondary' },
      not_interested: { label: 'Not Interested', variant: 'destructive' },
      call_back_later: { label: 'Call Back Later', variant: 'secondary' },
      getting_other_quotes: { label: 'Getting Other Quotes', variant: 'secondary' },
      send_info_email: { label: 'Send Info Email', variant: 'default' },
      deductible_discussed: { label: 'Deductible Discussed', variant: 'default' },
    }

    const config = outcomeConfig[outcome] || { label: outcome, variant: 'default' }
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    )
  }

  function getSeverityBadge(severity: string | null) {
    if (!severity) return null

    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700',
    }

    return (
      <Badge className={`text-xs ${colors[severity] || colors.low}`}>
        {severity.toUpperCase()}
      </Badge>
    )
  }

  function getUrgencyBadge(urgency: string | null) {
    if (!urgency) return null

    const colors: Record<string, string> = {
      low: 'bg-blue-100 text-blue-700',
      medium: 'bg-purple-100 text-purple-700',
      high: 'bg-pink-100 text-pink-700',
      critical: 'bg-red-100 text-red-700',
    }

    return (
      <Badge className={`text-xs ${colors[urgency] || colors.low}`}>
        {urgency.toUpperCase()}
      </Badge>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">Loading call history...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (calls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Phone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No calls recorded for this thread yet.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call History ({calls.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {calls.map((call) => (
            <div
              key={call.id}
              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              {/* Call Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      call.call_direction === 'inbound'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-green-100 text-green-600'
                    }`}
                  >
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {call.call_direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {formatDate(call.call_timestamp)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{formatDuration(call.duration_seconds)}</div>
                  <div className="text-xs text-gray-500">{call.caller_number}</div>
                </div>
              </div>

              {/* Call Summary */}
              {call.call_summary && (
                <div className="mb-3">
                  <div className="text-sm font-medium mb-1">Summary</div>
                  <div className="text-sm text-gray-700">{call.call_summary}</div>
                </div>
              )}

              {/* Call Details Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {call.call_outcome && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Outcome</div>
                    {getOutcomeBadge(call.call_outcome)}
                  </div>
                )}
                {call.job_type && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Job Type</div>
                    <Badge variant="outline" className="text-xs">
                      {call.job_type.replace('_', ' ')}
                    </Badge>
                  </div>
                )}
                {call.severity && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Severity</div>
                    {getSeverityBadge(call.severity)}
                  </div>
                )}
                {call.urgency && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Urgency</div>
                    {getUrgencyBadge(call.urgency)}
                  </div>
                )}
              </div>

              {/* Insurance Info */}
              {call.insurance_involvement && (
                <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Info className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">Insurance Involved</span>
                  </div>
                </div>
              )}

              {/* Revenue Intelligence */}
              {(call.estimated_job_value || call.job_potential_score) && (
                <div className="mb-3 p-2 bg-green-50 rounded border border-green-200">
                  <div className="flex items-center justify-between text-sm">
                    {call.estimated_job_value && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-900">
                          ${call.estimated_job_value.toLocaleString()} estimated
                        </span>
                      </div>
                    )}
                    {call.job_potential_score && (
                      <div className="text-xs text-green-700">
                        {call.job_potential_score}% potential
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pipeline Actions */}
              {call.pipeline_action_taken && call.pipeline_action_taken.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Pipeline Actions</div>
                  <div className="flex flex-wrap gap-1">
                    {call.pipeline_action_taken.map((action, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {action.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Coaching Tips */}
              {call.coaching_tips && call.coaching_tips.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Coaching Tips
                  </div>
                  <ul className="space-y-1">
                    {call.coaching_tips.map((tip, idx) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Processing Status */}
              {call.processed_at && (
                <div className="mt-3 pt-3 border-t text-xs text-gray-400">
                  Processed {formatDate(call.processed_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

