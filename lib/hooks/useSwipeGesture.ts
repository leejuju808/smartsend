'use client'

import { useRef, useEffect, RefObject } from 'react'

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // Minimum distance in pixels to trigger swipe
  velocityThreshold?: number // Minimum velocity to trigger swipe
}

/**
 * Hook to detect swipe gestures on an element
 */
export function useSwipeGesture(
  options: SwipeOptions
): RefObject<HTMLElement> {
  const elementRef = useRef<HTMLElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const threshold = options.threshold ?? 50
  const velocityThreshold = options.velocityThreshold ?? 0.3

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const deltaTime = Date.now() - touchStartRef.current.time
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const velocity = distance / deltaTime

      // Check if horizontal swipe is dominant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (velocity > velocityThreshold) {
          if (deltaX > 0 && options.onSwipeRight) {
            options.onSwipeRight()
          } else if (deltaX < 0 && options.onSwipeLeft) {
            options.onSwipeLeft()
          }
        }
      }

      touchStartRef.current = null
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [options, threshold, velocityThreshold])

  return elementRef
}



















































