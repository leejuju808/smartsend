'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { InboxV2ThreadList } from '@/components/inbox-v2/InboxV2ThreadList'
import { InboxV2Conversation } from '@/components/inbox-v2/InboxV2Conversation'
import { InboxV2AIActionPanel } from '@/components/inbox-v2/InboxV2AIActionPanel'
import { InboxV2Filters } from '@/components/inbox-v2/InboxV2Filters'
import { InboxV2MobileLayout } from '@/components/inbox-v2/mobile/InboxV2MobileLayout'
import { InboxV2SpeedMode } from '@/components/inbox-v2/mobile/InboxV2SpeedMode'
import { InboxV2FloatingActions } from '@/components/inbox-v2/mobile/InboxV2FloatingActions'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { useLowPowerMode } from '@/lib/hooks/useBattery'
import { cacheThreadList, getCachedThreadList, cacheThreadDetail, getCachedThreadDetail, addPendingMessage, getPendingMessages } from '@/lib/utils/offlineCache'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export type InboxFilter = 
  | 'all' 
  | 'unread' 
  | 'hot_leads' 
  | 'insurance' 
  | 'storm' 
  | 'needs_reply' 
  | 'waiting' 
  | 'booked'

export type InboxSort = 'newest' | 'hottest' | 'storm_affected' | 'insurance' | 'unread'

export type ThreadV2 = {
  id: string
  thread_key?: string
  subject: string | null
  homeowner_name: string | null
  last_message_snippet: string | null
  last_message_at: string
  unread_count: number
  pipeline_stage_key: string | null
  lead_heat_score: number | null
  has_storm_damage: boolean
  has_insurance_claim: boolean
  has_appointment: boolean
  has_quote: boolean
  priority_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue'
  contact_id: string | null
  campaign_id: string | null
  status: 'open' | 'snoozed' | 'archived'
  assigned_to: string | null
}

export type MessageV2 = {
  id: string
  direction: 'in' | 'out'
  from_email: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  sent_at: string
  attachments?: Array<{
    id: string
    file_name: string
    file_type: string
    file_url: string
  }>
  deliverability_status?: {
    status: 'delivered' | 'opened' | 'link_clicked' | 'bounced' | 'marked_spam' | 'queued' | 'sent'
    status_updated_at: string
  }
}

export type ThreadDetailV2 = {
  thread: ThreadV2
  messages: MessageV2[]
  contact: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
  } | null
  ai_analysis: {
    intent_type: string | null
    emotional_tone: string | null
    urgency_level: string | null
    has_insurance_intent: boolean
    has_booking_intent: boolean
    has_storm_damage: boolean
    extracted_questions: Array<{ question: string; type: string }>
    suggested_actions: Array<{ action: string; priority: number; reasoning: string }>
    suggested_pipeline_stage: string | null
  } | null
  suggestions: {
    suggested_replies: Array<{ text: string; type: string; confidence: number }>
    booking_suggestions: Array<{ time: string; date: string; type: string }>
    insurance_actions: Array<{ action: string; template: string }>
    storm_actions: Array<{ action: string; template: string; urgency: string }>
  } | null
}

export default function InboxV2Page() {
  const searchParams = useSearchParams()
  const [threads, setThreads] = useState<ThreadV2[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadDetail, setThreadDetail] = useState<ThreadDetailV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [sort, setSort] = useState<InboxSort>('newest')
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set())
  
  // Mobile state
  const isMobile = useIsMobile()
  const [showThreadList, setShowThreadList] = useState(true)
  const [speedMode, setSpeedMode] = useState(false)
  const [currentChannel, setCurrentChannel] = useState<'sms' | 'email'>('sms')
  
  // Offline & Performance
  const isOnline = useOnlineStatus()
  const lowPowerMode = useLowPowerMode()

  // Load threads with offline support
  const loadThreads = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        filter,
        sort,
      })
      const campaignId = searchParams.get('campaign_id')
      if (campaignId) {
        params.set('campaign_id', campaignId)
      }

      const res = await fetch(`/api/inbox-v2/threads?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load threads')
      }
      const data = await res.json()
      const threadsData = data.threads || []
      setThreads(threadsData)
      
      // Cache threads for offline access
      if (isOnline) {
        cacheThreadList(threadsData)
      }
      
      // Auto-select first thread if none selected
      if (!selectedThreadId && threadsData?.[0]) {
        setSelectedThreadId(threadsData[0].id)
      }
    } catch (error) {
      console.error('Error loading threads:', error)
      
      // Try to load from cache if offline
      if (!isOnline) {
        const cached = getCachedThreadList()
        if (cached) {
          setThreads(cached)
          toast.info('Showing cached threads (offline mode)')
        } else {
          toast.error('No cached data available')
        }
      } else {
        toast.error('Failed to load inbox')
      }
    } finally {
      setLoading(false)
    }
  }

  // Load thread detail with offline support
  const loadThreadDetail = async (threadId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/inbox-v2/threads/${threadId}`)
      if (!res.ok) {
        throw new Error('Failed to load thread detail')
      }
      const data = await res.json()
      setThreadDetail(data)
      
      // Cache thread detail for offline access
      if (isOnline) {
        cacheThreadDetail(threadId, data)
      }
      
      // On mobile, hide thread list when detail loads
      if (isMobile) {
        setShowThreadList(false)
      }
    } catch (error) {
      console.error('Error loading thread detail:', error)
      
      // Try to load from cache if offline
      if (!isOnline) {
        const cached = getCachedThreadDetail(threadId)
        if (cached) {
          setThreadDetail(cached)
          toast.info('Showing cached conversation (offline mode)')
        } else {
          toast.error('No cached data available')
        }
      } else {
        toast.error('Failed to load conversation')
      }
    } finally {
      setDetailLoading(false)
    }
  }

  // Handle thread selection
  const handleThreadSelect = (threadId: string) => {
    setSelectedThreadId(threadId)
    loadThreadDetail(threadId)
  }

  // Handle swipe actions
  const handleSwipeAction = async (threadId: string, action: string) => {
    try {
      const res = await fetch(`/api/inbox-v2/threads/${threadId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      
      if (!res.ok) {
        throw new Error('Failed to perform action')
      }
      
      await loadThreads()
      if (selectedThreadId === threadId) {
        await loadThreadDetail(threadId)
      }
    } catch (error) {
      console.error('Error performing swipe action:', error)
      toast.error('Failed to perform action')
    }
  }

  // Handle FAB actions
  const handleCall = () => {
    if (threadDetail?.contact?.phone) {
      window.location.href = `tel:${threadDetail.contact.phone}`
    }
  }

  const handleBook = async () => {
    // TODO: Open booking modal
    toast.info('Booking feature coming soon')
  }

  const handleAIReply = () => {
    // TODO: Trigger AI reply generation
    toast.info('AI Reply feature coming soon')
  }

  const handleTask = async () => {
    if (!selectedThreadId) return
    try {
      const res = await fetch(`/api/inbox-v2/threads/${selectedThreadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: 'Follow up on this conversation',
        }),
      })
      if (res.ok) {
        toast.success('Task created')
      }
    } catch (error) {
      toast.error('Failed to create task')
    }
  }

  // Handle bulk actions
  const handleBulkAction = async (action: string) => {
    if (selectedThreadIds.size === 0) {
      toast.error('No threads selected')
      return
    }

    try {
      const res = await fetch('/api/inbox-v2/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_ids: Array.from(selectedThreadIds),
          action,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to perform bulk action')
      }

      toast.success(`Bulk action completed: ${action}`)
      setSelectedThreadIds(new Set())
      await loadThreads()
      if (selectedThreadId) {
        await loadThreadDetail(selectedThreadId)
      }
    } catch (error) {
      console.error('Error performing bulk action:', error)
      toast.error('Failed to perform bulk action')
    }
  }

  // Initial load
  useEffect(() => {
    loadThreads()
  }, [filter, sort, searchParams])

  // Load detail when thread selected
  useEffect(() => {
    if (selectedThreadId) {
      loadThreadDetail(selectedThreadId)
    }
  }, [selectedThreadId])

  // Show low power mode banner
  useEffect(() => {
    if (lowPowerMode) {
      toast.info('Low power mode enabled for performance', { duration: 5000 })
    }
  }, [lowPowerMode])

  // Sync pending messages when coming back online
  useEffect(() => {
    if (isOnline) {
      const pending = getPendingMessages()
      if (pending.length > 0) {
        toast.info(`Syncing ${pending.length} pending message(s)...`)
        // TODO: Retry sending pending messages
      }
    }
  }, [isOnline])

  return (
    <InboxV2SpeedMode enabled={speedMode} onToggle={setSpeedMode}>
      <div className={cn(
        'h-[calc(100vh-64px)] flex flex-col bg-gray-50',
        lowPowerMode && 'low-power-mode'
      )}>
        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-yellow-500 text-white px-4 py-2 text-sm text-center">
            Offline Mode - Showing cached data
          </div>
        )}

        {/* Low Power Banner */}
        {lowPowerMode && (
          <div className="bg-orange-500 text-white px-4 py-2 text-sm text-center">
            Low power mode enabled for performance
          </div>
        )}

        {/* Header with Filters */}
        <div className={cn(
          'border-b bg-white px-4 py-3',
          speedMode && 'hidden'
        )}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-semibold">Inbox</h1>
              <p className="text-xs text-gray-600">
                AI-powered communication hub for roofing contractors
              </p>
            </div>
          </div>
          <InboxV2Filters
            filter={filter}
            sort={sort}
            onFilterChange={setFilter}
            onSortChange={setSort}
            selectedCount={selectedThreadIds.size}
            onBulkAction={handleBulkAction}
          />
        </div>

        {/* Mobile Layout */}
        <InboxV2MobileLayout
          threadList={
            <InboxV2ThreadList
              threads={threads}
              selectedThreadId={selectedThreadId}
              onThreadSelect={handleThreadSelect}
              loading={loading}
              selectedThreadIds={selectedThreadIds}
              onSelectionChange={setSelectedThreadIds}
              onSwipeAction={handleSwipeAction}
            />
          }
          conversation={
            threadDetail ? (
              <InboxV2Conversation
                detail={threadDetail}
                loading={detailLoading}
                onRefresh={() => selectedThreadId && loadThreadDetail(selectedThreadId)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-sm">Select a conversation to view messages</p>
                </div>
              </div>
            )
          }
          aiPanel={
            threadDetail && !speedMode ? (
              <InboxV2AIActionPanel
                detail={threadDetail}
                onPipelineAction={async (stage) => {
                  try {
                    const res = await fetch(`/api/inbox-v2/threads/${selectedThreadId}/pipeline`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stage }),
                    })
                    if (res.ok) {
                      toast.success(`Moved to ${stage}`)
                      await loadThreads()
                      await loadThreadDetail(selectedThreadId!)
                    }
                  } catch (error) {
                    toast.error('Failed to update pipeline')
                  }
                }}
                onTaskAction={async (action, taskData) => {
                  try {
                    const res = await fetch(`/api/inbox-v2/threads/${selectedThreadId}/tasks`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action, ...taskData }),
                    })
                    if (res.ok) {
                      toast.success('Task action completed')
                      await loadThreadDetail(selectedThreadId!)
                    }
                  } catch (error) {
                    toast.error('Failed to perform task action')
                  }
                }}
              />
            ) : null
          }
          showThreadList={showThreadList}
          onShowThreadList={setShowThreadList}
        />

        {/* Floating Action Buttons - Mobile Only */}
        {isMobile && threadDetail && (
          <InboxV2FloatingActions
            phone={threadDetail.contact?.phone}
            onCall={handleCall}
            onBook={handleBook}
            onAIReply={handleAIReply}
            onTask={handleTask}
            onToggleChannel={setCurrentChannel}
            currentChannel={currentChannel}
          />
        )}
      </div>
    </InboxV2SpeedMode>
  )
}



