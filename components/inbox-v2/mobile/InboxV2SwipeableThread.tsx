'use client'

import { ReactNode, useState, useRef } from 'react'
import { useSwipeGesture } from '@/lib/hooks/useSwipeGesture'
import { CheckCircle2, Flag, Archive, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxV2SwipeableThreadProps {
  children: ReactNode
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  swipeRightAction?: 'follow_up' | 'hot'
  swipeLeftAction?: 'completed' | 'not_interested'
  className?: string
}

/**
 * Swipeable thread item with iPhone-level smooth animations
 */
export function InboxV2SwipeableThread({
  children,
  onSwipeRight,
  onSwipeLeft,
  swipeRightAction = 'follow_up',
  swipeLeftAction = 'completed',
  className,
}: InboxV2SwipeableThreadProps) {
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y

    // Only allow horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault()
      setSwipeOffset(deltaX)
    }
  }

  const handleTouchEnd = () => {
    const threshold = 100
    const velocity = Math.abs(swipeOffset)

    if (velocity > threshold) {
      if (swipeOffset > 0 && onSwipeRight) {
        onSwipeRight()
      } else if (swipeOffset < 0 && onSwipeLeft) {
        onSwipeLeft()
      }
    }

    setSwipeOffset(0)
    setIsSwiping(false)
    touchStartRef.current = null
  }

  const getSwipeActionIcon = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      return swipeRightAction === 'follow_up' ? (
        <Flag className="w-5 h-5" />
      ) : (
        <Flag className="w-5 h-5" />
      )
    } else {
      return swipeLeftAction === 'completed' ? (
        <CheckCircle2 className="w-5 h-5" />
      ) : (
        <X className="w-5 h-5" />
      )
    }
  }

  const getSwipeActionLabel = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      return swipeRightAction === 'follow_up' ? 'Follow-Up' : 'Hot'
    } else {
      return swipeLeftAction === 'completed' ? 'Complete' : 'Not Interested'
    }
  }

  return (
    <div
      ref={elementRef}
      className={cn('relative overflow-hidden', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        touchAction: 'pan-y',
      }}
    >
      {/* Swipe Right Action Background */}
      {swipeOffset > 0 && (
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 flex items-center justify-start px-6 z-0"
          style={{
            width: `${Math.min(Math.abs(swipeOffset), 120)}px`,
            transform: `translateX(${swipeOffset > 0 ? 0 : swipeOffset}px)`,
          }}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {getSwipeActionIcon('right')}
            <span className="text-xs font-medium">
              {getSwipeActionLabel('right')}
            </span>
          </div>
        </div>
      )}

      {/* Swipe Left Action Background */}
      {swipeOffset < 0 && (
        <div
          className="absolute inset-y-0 right-0 bg-red-500 flex items-center justify-end px-6 z-0"
          style={{
            width: `${Math.min(Math.abs(swipeOffset), 120)}px`,
            transform: `translateX(${swipeOffset < 0 ? 0 : swipeOffset}px)`,
          }}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {getSwipeActionIcon('left')}
            <span className="text-xs font-medium">
              {getSwipeActionLabel('left')}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'relative z-10 bg-white transition-transform duration-200',
          isSwiping && 'transition-none'
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}



















































