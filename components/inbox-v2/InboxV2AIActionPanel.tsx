'use client'

import { ThreadDetailV2 } from '@/app/(dash)/inbox-v2/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { 
  Flame, 
  CloudRain, 
  Shield, 
  Calendar, 
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { InboxV2BookingPrompts } from './InboxV2BookingPrompts'
import { InboxV2InsurancePrompts } from './InboxV2InsurancePrompts'
import { InboxV2StormPrompts } from './InboxV2StormPrompts'

type Props = {
  detail: ThreadDetailV2
  onPipelineAction: (stage: string) => Promise<void>
  onTaskAction: (action: string, data?: any) => Promise<void>
}

export function InboxV2AIActionPanel({ detail, onPipelineAction, onTaskAction }: Props) {
  const analysis = detail.ai_analysis
  const suggestions = detail.suggestions

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* AI Reply Summary */}
      {analysis && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            AI Reply Summary
          </h3>

          <div className="space-y-3 text-sm">
            {/* Intent */}
            {analysis.intent_type && (
              <div>
                <span className="text-gray-600">Intent:</span>{' '}
                <Badge variant="outline" className="ml-1">
                  {analysis.intent_type.replace(/_/g, ' ')}
                </Badge>
              </div>
            )}

            {/* Tone & Urgency */}
            <div className="flex items-center gap-4">
              {analysis.emotional_tone && (
                <div>
                  <span className="text-gray-600">Tone:</span>{' '}
                  <span className="capitalize">{analysis.emotional_tone}</span>
                </div>
              )}
              {analysis.urgency_level && (
                <div>
                  <span className="text-gray-600">Urgency:</span>{' '}
                  <Badge 
                    variant={analysis.urgency_level === 'critical' ? 'destructive' : 'outline'}
                    className="ml-1"
                  >
                    {analysis.urgency_level}
                  </Badge>
                </div>
              )}
            </div>

            {/* Questions */}
            {analysis.extracted_questions && analysis.extracted_questions.length > 0 && (
              <div>
                <span className="text-gray-600">Questions Asked:</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {analysis.extracted_questions.map((q, i) => (
                    <li key={i} className="text-xs">{q.question}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Step Recommendation */}
            {analysis.suggested_actions && analysis.suggested_actions.length > 0 && (
              <div>
                <span className="text-gray-600">Next Step:</span>
                <div className="mt-1">
                  {analysis.suggested_actions
                    .sort((a, b) => b.priority - a.priority)
                    .slice(0, 1)
                    .map((action, i) => (
                      <div key={i} className="text-xs bg-blue-50 p-2 rounded mt-1">
                        <strong>{action.action}</strong>
                        {action.reasoning && (
                          <p className="text-gray-600 mt-1">{action.reasoning}</p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Booking Prompts */}
      {analysis?.has_booking_intent && (
        <InboxV2BookingPrompts
          suggestions={suggestions?.booking_suggestions || []}
          contactId={detail.contact?.id}
          onBook={async (time, date) => {
            // Handle booking
            console.log('Booking:', time, date)
          }}
        />
      )}

      {/* Insurance Prompts */}
      {analysis?.has_insurance_intent && (
        <InboxV2InsurancePrompts
          suggestions={suggestions?.insurance_actions || []}
          onAction={async (action) => {
            await onPipelineAction('insurance')
          }}
        />
      )}

      {/* Storm Damage Prompts */}
      {analysis?.has_storm_damage && (
        <InboxV2StormPrompts
          suggestions={suggestions?.storm_actions || []}
          urgencyScore={analysis.urgency_level || 'medium'}
          onAction={async (action) => {
            await onPipelineAction('hot')
            await onTaskAction('create', {
              title: 'URGENT: Storm damage - Schedule inspection',
              priority: 'urgent',
            })
          }}
        />
      )}

      {/* Suggested Replies */}
      {suggestions && suggestions.suggested_replies && suggestions.suggested_replies.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Suggested Replies</h3>
          <div className="space-y-2">
            {suggestions.suggested_replies.slice(0, 3).map((reply, i) => (
              <Button
                key={i}
                variant="outline"
                className="w-full justify-start text-left h-auto py-2 px-3"
                onClick={() => {
                  // Copy to composer
                  console.log('Use reply:', reply.text)
                }}
              >
                <div className="flex-1">
                  <div className="text-xs font-medium mb-1">{reply.type}</div>
                  <div className="text-xs text-gray-600 line-clamp-2">{reply.text}</div>
                </div>
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Pipeline Actions */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Pipeline Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('warm')}
            className="text-xs"
          >
            Move to Warm
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('hot')}
            className="text-xs"
          >
            Move to Hot 🔥
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('appointment')}
            className="text-xs"
          >
            Move to Appointment
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('insurance')}
            className="text-xs"
          >
            Move to Insurance
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('re_quote')}
            className="text-xs"
          >
            Move to Re-Quote
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPipelineAction('not_interested')}
            className="text-xs"
          >
            Not Interested
          </Button>
        </div>
      </Card>

      {/* Task Actions */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Task Actions</h3>
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => onTaskAction('create', {
              title: 'Follow up on this conversation',
              due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })}
          >
            <Clock className="w-4 h-4 mr-2" />
            Create Follow-up Task
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => onTaskAction('mark_waiting')}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Mark as Waiting on Homeowner
          </Button>
        </div>
      </Card>
    </div>
  )
}





















































