'use client'

import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InboxV2TapToCall } from './InboxV2TapToCall'
import { cn } from '@/lib/utils'

interface InboxV2StickyHeaderProps {
  contactName?: string | null
  phone?: string | null
  onCall?: () => void
  className?: string
}

/**
 * Sticky header showing contact name + call button
 * Always visible on mobile for quick access
 */
export function InboxV2StickyHeader({
  contactName,
  phone,
  onCall,
  className,
}: InboxV2StickyHeaderProps) {
  const handleCall = () => {
    if (onCall) {
      onCall()
    } else if (phone) {
      window.location.href = `tel:${phone}`
    }
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-10 bg-white border-b p-4 flex items-center justify-between',
        'backdrop-blur-sm bg-white/95',
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold truncate">
          {contactName || 'Unknown Contact'}
        </h2>
        {phone && (
          <InboxV2TapToCall phone={phone}>
            <span className="text-sm text-gray-600">{phone}</span>
          </InboxV2TapToCall>
        )}
      </div>

      {phone && (
        <Button
          size="icon"
          className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 flex-shrink-0 ml-3"
          onClick={handleCall}
        >
          <Phone className="h-5 w-5 text-white" />
        </Button>
      )}
    </div>
  )
}



















































