'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { isCoachingUIEnabled } from '@/lib/feature-flags'

interface TooltipContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined)

export function TooltipProvider({
  children,
  delayDuration = 0,
}: {
  children: React.ReactNode
  delayDuration?: number
}) {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = React.useState(false)

  const setOpenWithDelay = React.useCallback(
    (next: boolean) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      if (next && delayDuration > 0) {
        timeoutRef.current = setTimeout(() => {
          setOpen(true)
        }, delayDuration)
        return
      }

      setOpen(next)
    },
    [delayDuration]
  )

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <TooltipContext.Provider value={{ open, setOpen: setOpenWithDelay }}>
      {children}
    </TooltipContext.Provider>
  )
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function TooltipTrigger({ 
  asChild, 
  children 
}: { 
  asChild?: boolean
  children: React.ReactNode 
}) {
  const context = React.useContext(TooltipContext)
  if (!context) throw new Error('TooltipTrigger must be used within TooltipProvider')

  const handleMouseEnter = () => context.setOpen(true)
  const handleMouseLeave = () => context.setOpen(false)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    })
  }

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
    </div>
  )
}

export function TooltipContent({ 
  className, 
  children 
}: { 
  className?: string
  children: React.ReactNode 
}) {
  const context = React.useContext(TooltipContext)
  if (!context) throw new Error('TooltipContent must be used within TooltipProvider')

  // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
  if (!isCoachingUIEnabled()) return null

  if (!context.open) return null

  return (
    <div className="relative">
      <div
        className={cn(
          'absolute z-50 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap bottom-full left-1/2 transform -translate-x-1/2 mb-1',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

