'use client'

import { Phone, Calendar, Sparkles, CheckSquare, MessageSquare, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface InboxV2FloatingActionsProps {
  phone?: string | null
  onCall?: () => void
  onBook?: () => void
  onAIReply?: () => void
  onTask?: () => void
  onToggleChannel?: (channel: 'sms' | 'email') => void
  currentChannel?: 'sms' | 'email'
  className?: string
}

/**
 * Floating Action Buttons (FAB) for mobile inbox
 * Large tap targets optimized for roofers with gloves
 */
export function InboxV2FloatingActions({
  phone,
  onCall,
  onBook,
  onAIReply,
  onTask,
  onToggleChannel,
  currentChannel = 'sms',
  className,
}: InboxV2FloatingActionsProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('fixed bottom-6 right-6 z-50 md:hidden', className)}>
      {/* Expanded Actions */}
      {expanded && (
        <div className="absolute bottom-20 right-0 flex flex-col gap-3 mb-2">
          {/* Call Button */}
          {phone && onCall && (
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg bg-green-500 hover:bg-green-600"
              onClick={() => {
                onCall()
                setExpanded(false)
              }}
            >
              <Phone className="h-6 w-6" />
            </Button>
          )}

          {/* Book Button */}
          {onBook && (
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg bg-blue-500 hover:bg-blue-600"
              onClick={() => {
                onBook()
                setExpanded(false)
              }}
            >
              <Calendar className="h-6 w-6" />
            </Button>
          )}

          {/* AI Reply Button */}
          {onAIReply && (
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg bg-purple-500 hover:bg-purple-600"
              onClick={() => {
                onAIReply()
                setExpanded(false)
              }}
            >
              <Sparkles className="h-6 w-6" />
            </Button>
          )}

          {/* Task Button */}
          {onTask && (
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                onTask()
                setExpanded(false)
              }}
            >
              <CheckSquare className="h-6 w-6" />
            </Button>
          )}

          {/* Channel Toggle */}
          {onToggleChannel && (
            <Button
              size="lg"
              variant="outline"
              className="h-14 w-14 rounded-full shadow-lg bg-white"
              onClick={() => {
                onToggleChannel(currentChannel === 'sms' ? 'email' : 'sms')
                setExpanded(false)
              }}
            >
              {currentChannel === 'sms' ? (
                <MessageSquare className="h-6 w-6" />
              ) : (
                <Mail className="h-6 w-6" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Main FAB */}
      <Button
        size="lg"
        className={cn(
          'h-16 w-16 rounded-full shadow-xl transition-transform duration-200',
          expanded ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={cn('text-2xl transition-transform duration-200', expanded && 'rotate-45')}>
          +
        </span>
      </Button>
    </div>
  )
}



















































