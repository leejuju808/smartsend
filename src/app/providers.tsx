'use client'

import { useEffect } from 'react'

// Lazy import PostHog to avoid build errors if not installed
let posthog: any = null
let PHProvider: any = null

if (typeof window !== 'undefined') {
  try {
    const ph = require('posthog-js')
    const php = require('posthog-js/react')
    posthog = ph.default || ph
    PHProvider = php.PostHogProvider
  } catch (error) {
    console.log('PostHog not installed, skipping initialization')
  }
  
  // Initialize PostHog on the client
  if (posthog && PHProvider && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
    })
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initial pageview
    if (posthog && typeof posthog.capture === 'function') {
      posthog.capture('$pageview')
    }
  }, [])

  if (!PHProvider || !posthog) {
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      {children}
    </PHProvider>
  )
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      {children}
    </PostHogProvider>
  )
}

