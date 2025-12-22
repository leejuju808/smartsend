// Block 20000 — Voice Navigation Hook
// Handles voice-based navigation commands

'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

export interface NavigationCommand {
  command: string
  action: () => void
}

export function useVoiceNavigation() {
  const router = useRouter()

  const handleNavigationCommand = useCallback(
    (command: string, params?: any) => {
      switch (command) {
        case 'next_lead':
        case 'next':
          // Navigate to next thread (would need thread list context)
          return { type: 'navigate', action: 'next_thread' }

        case 'back_to_inbox':
        case 'go_back':
        case 'inbox':
          router.push('/inbox-v2')
          return { type: 'navigate', action: 'inbox' }

        case 'open_calendar':
        case 'calendar':
          router.push('/calendar')
          return { type: 'navigate', action: 'calendar' }

        case 'show_todays_schedule':
        case 'todays_schedule':
          router.push('/calendar?view=today')
          return { type: 'navigate', action: 'schedule_today' }

        case 'open_tasks':
        case 'tasks':
          router.push('/tasks')
          return { type: 'navigate', action: 'tasks' }

        case 'show_storm_leads':
        case 'storm_leads':
          router.push('/inbox-v2?filter=storm')
          return { type: 'navigate', action: 'storm_leads' }

        case 'show_hot_leads':
        case 'hot_leads':
          router.push('/inbox-v2?filter=hot')
          return { type: 'navigate', action: 'hot_leads' }

        default:
          return null
      }
    },
    [router]
  )

  return {
    handleNavigationCommand,
  }
}



















































