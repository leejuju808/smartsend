'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QuickReply {
  text: string
  type: string
}

interface InboxV2QuickRepliesProps {
  replies: QuickReply[]
  onSelect: (reply: QuickReply) => void
  className?: string
}

/**
 * Horizontal quick reply suggestions for mobile
 * Zero typing needed - tap to auto-fill
 */
export function InboxV2QuickReplies({
  replies,
  onSelect,
  className,
}: InboxV2QuickRepliesProps) {
  if (!replies || replies.length === 0) return null

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-2 px-4 md:hidden',
        'scrollbar-hide',
        className
      )}
      style={{
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {replies.map((reply, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onSelect(reply)}
          className={cn(
            'whitespace-nowrap flex-shrink-0',
            'text-xs px-3 py-1.5 h-auto',
            'border-blue-200 text-blue-700 hover:bg-blue-50'
          )}
        >
          {reply.text}
        </Button>
      ))}
    </div>
  )
}

/**
 * Default quick replies for roofing context
 */
export const DEFAULT_QUICK_REPLIES = [
  { text: 'Yes', type: 'affirmative' },
  { text: 'No', type: 'negative' },
  { text: "What's your address?", type: 'address_request' },
  { text: 'When works for you?', type: 'scheduling' },
  { text: 'We can come today', type: 'immediate_availability' },
  { text: 'Price range?', type: 'pricing' },
  { text: 'Insurance help?', type: 'insurance' },
  { text: 'Send photos?', type: 'photo_request' },
]



















































