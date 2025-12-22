'use client'

import { ReactNode, useState, useEffect } from 'react'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { ArrowLeft, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InboxV2MobileLayoutProps {
  threadList: ReactNode
  conversation: ReactNode
  aiPanel?: ReactNode
  showThreadList: boolean
  onShowThreadList: (show: boolean) => void
}

/**
 * Mobile-first layout with single-panel flow
 * Desktop: Three-panel layout
 * Mobile: Single-panel with slide animations
 */
export function InboxV2MobileLayout({
  threadList,
  conversation,
  aiPanel,
  showThreadList,
  onShowThreadList,
}: InboxV2MobileLayoutProps) {
  const isMobile = useIsMobile()
  const [isTransitioning, setIsTransitioning] = useState(false)

  // On mobile, show thread list by default when no thread is selected
  useEffect(() => {
    if (isMobile) {
      // Auto-show thread list if we're on mobile and no conversation is active
      // This will be controlled by parent component
    }
  }, [isMobile])

  if (!isMobile) {
    // Desktop: Three-panel layout
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Thread List */}
        <div className="w-80 border-r bg-white overflow-hidden flex flex-col">
          {threadList}
        </div>

        {/* Middle Panel: Conversation */}
        <div className="flex-1 border-r bg-white overflow-hidden flex flex-col">
          {conversation}
        </div>

        {/* Right Panel: AI Action Panel */}
        {aiPanel && (
          <div className="w-96 border-l bg-white overflow-hidden flex flex-col">
            {aiPanel}
          </div>
        )}
      </div>
    )
  }

  // Mobile: Single-panel flow with slide animations
  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Thread List - Full Screen on Mobile */}
      <div
        className={cn(
          'absolute inset-0 bg-white z-50 transform transition-transform duration-300 ease-in-out',
          showThreadList ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-full flex flex-col">
          {/* Back button in thread list (hidden when showing list) */}
          <div className="p-4 border-b">
            <h1 className="text-xl font-semibold">Inbox</h1>
          </div>
          <div className="flex-1 overflow-auto">{threadList}</div>
        </div>
      </div>

      {/* Conversation - Full Screen on Mobile */}
      <div
        className={cn(
          'absolute inset-0 bg-white z-40 transform transition-transform duration-300 ease-in-out flex flex-col',
          showThreadList ? 'translate-x-full' : 'translate-x-0'
        )}
      >
        {/* Sticky Header with Back Button */}
        <div className="sticky top-0 z-10 bg-white border-b p-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onShowThreadList(true)}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {/* Contact name will be shown here */}
          </div>
        </div>

        {/* Conversation Content */}
        <div className="flex-1 overflow-auto">{conversation}</div>
      </div>
    </div>
  )
}



















































