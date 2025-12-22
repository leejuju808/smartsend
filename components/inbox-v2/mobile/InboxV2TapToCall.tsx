'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface InboxV2TapToCallProps {
  phone?: string | null
  children: ReactNode
  className?: string
}

/**
 * Makes any phone number clickable for tap-to-call
 * Critical for mobile roofers
 */
export function InboxV2TapToCall({
  phone,
  children,
  className,
}: InboxV2TapToCallProps) {
  if (!phone) return <>{children}</>

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    window.location.href = `tel:${phone}`
  }

  return (
    <span
      onClick={handleClick}
      className={cn(
        'text-blue-600 underline cursor-pointer active:text-blue-800',
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * Utility to extract and make phone numbers clickable in text
 */
export function makePhoneNumbersClickable(text: string): ReactNode {
  const phoneRegex = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g
  const parts = text.split(phoneRegex)
  
  return parts.map((part, index) => {
    if (phoneRegex.test(part)) {
      return (
        <InboxV2TapToCall key={index} phone={part}>
          {part}
        </InboxV2TapToCall>
      )
    }
    return <span key={index}>{part}</span>
  })
}



















































