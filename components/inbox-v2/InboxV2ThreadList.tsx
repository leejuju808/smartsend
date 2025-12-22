'use client'

import { ThreadV2 } from '@/app/(dash)/inbox-v2/page'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { 
  CloudRain, 
  Shield, 
  Calendar, 
  FileText, 
  Flame,
  Circle
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { InboxV2SwipeableThread } from './mobile/InboxV2SwipeableThread'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { toast } from 'sonner'
import { JobTypeBadgeCompact } from './JobTypeBadges'

type Props = {
  threads: ThreadV2[]
  selectedThreadId: string | null
  onThreadSelect: (threadId: string) => void
  loading: boolean
  selectedThreadIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onSwipeAction?: (threadId: string, action: string) => Promise<void>
}

export function InboxV2ThreadList({
  threads,
  selectedThreadId,
  onThreadSelect,
  loading,
  selectedThreadIds,
  onSelectionChange,
  onSwipeAction,
}: Props) {
  const isMobile = useIsMobile()
  const handleSelect = (threadId: string, checked: boolean) => {
    const newSet = new Set(selectedThreadIds)
    if (checked) {
      newSet.add(threadId)
    } else {
      newSet.delete(threadId)
    }
    onSelectionChange(newSet)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(new Set(threads.map(t => t.id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const getPriorityColor = (color: string) => {
    switch (color) {
      case 'red': return 'bg-red-500'
      case 'orange': return 'bg-orange-500'
      case 'yellow': return 'bg-yellow-500'
      case 'green': return 'bg-green-500'
      default: return 'bg-blue-500'
    }
  }

  const getHeatScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-400'
    if (score >= 80) return 'text-red-600 font-semibold'
    if (score >= 50) return 'text-orange-600'
    return 'text-blue-600'
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading threads...</div>
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-400">No conversations found</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Select All */}
      <div className="p-3 border-b flex items-center gap-2">
        <Checkbox
          checked={selectedThreadIds.size === threads.length && threads.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <span className="text-xs text-gray-600">
          {selectedThreadIds.size > 0 ? `${selectedThreadIds.size} selected` : 'Select all'}
        </span>
      </div>

      {/* Thread List */}
      <div className="divide-y">
        {threads.map((thread) => {
          const isSelected = selectedThreadId === thread.id
          const isChecked = selectedThreadIds.has(thread.id)

          const handleSwipeRight = async () => {
            if (onSwipeAction) {
              await onSwipeAction(thread.id, 'follow_up')
              toast.success('Marked as Follow-Up')
            }
          }

          const handleSwipeLeft = async () => {
            if (onSwipeAction) {
              await onSwipeAction(thread.id, 'completed')
              toast.success('Marked as Completed')
            }
          }

          const threadContent = (
            <div
              className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
              onClick={() => onThreadSelect(thread.id)}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    handleSelect(thread.id, checked as boolean)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />

                <div className="flex-1 min-w-0">
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-semibold text-sm truncate">
                          {thread.homeowner_name || 'Unknown'}
                        </span>
                        {thread.unread_count > 0 && (
                          <Circle className="w-2 h-2 fill-blue-600 text-blue-600" />
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Indicators Row */}
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {/* Job Type Badge - Block 19930 */}
                    {thread.job_type && (
                      <JobTypeBadgeCompact
                        jobType={thread.job_type}
                        severityLevel={thread.severity_level}
                        insuranceVsRetail={thread.insurance_vs_retail}
                      />
                    )}
                    {thread.pipeline_stage_key && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {thread.pipeline_stage_key}
                      </Badge>
                    )}
                    {thread.lead_heat_score !== null && (
                      <span className={`text-[10px] ${getHeatScoreColor(thread.lead_heat_score)}`}>
                        <Flame className="w-3 h-3 inline mr-0.5" />
                        {thread.lead_heat_score}
                      </span>
                    )}
                    {thread.has_storm_damage && (
                      <CloudRain className="w-3.5 h-3.5 text-blue-600" title="Storm damage" />
                    )}
                    {thread.has_insurance_claim && (
                      <Shield className="w-3.5 h-3.5 text-green-600" title="Insurance claim" />
                    )}
                    {thread.has_appointment && (
                      <Calendar className="w-3.5 h-3.5 text-purple-600" title="Has appointment" />
                    )}
                    {thread.has_quote && (
                      <FileText className="w-3.5 h-3.5 text-orange-600" title="Has quote" />
                    )}
                  </div>

                  {/* Priority Strip */}
                  {thread.priority_color && (
                    <div className={`h-0.5 ${getPriorityColor(thread.priority_color)} mb-1.5`} />
                  )}

                  {/* Message Snippet */}
                  {thread.last_message_snippet && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {thread.last_message_snippet}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )

          // Wrap in swipeable component on mobile
          if (isMobile) {
            return (
              <InboxV2SwipeableThread
                key={thread.id}
                onSwipeRight={handleSwipeRight}
                onSwipeLeft={handleSwipeLeft}
                swipeRightAction="follow_up"
                swipeLeftAction="completed"
              >
                {threadContent}
              </InboxV2SwipeableThread>
            )
          }

          return (
            <div key={thread.id}>
              {threadContent}
            </div>
          )
        })}
      </div>
    </div>
  )
}



