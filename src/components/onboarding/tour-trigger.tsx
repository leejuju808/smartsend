'use client'

import { useEffect, useState } from 'react'
import { TourOverlay, TourStep } from './tour-overlay'
import { createClientComponentClient } from '@/lib/supabase'
import { isCoachingUIEnabled } from '@/lib/feature-flags'

interface TourTriggerProps {
  workspaceId?: string
  tourSteps: TourStep[]
}

const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SmartSend',
    description: 'Let\'s take a quick tour to help you get started. We\'ll show you the key features.',
    position: 'center',
  },
  {
    id: 'dashboard',
    title: 'This is your Dashboard',
    description: 'Here you can see all your campaigns, leads, and analytics in one place.',
    target: '[data-tour="dashboard"]',
    position: 'bottom',
  },
  {
    id: 'connect_mailbox',
    title: 'Connect a Mailbox',
    description: 'Connect your Gmail or Outlook account here to start sending emails.',
    target: '[data-tour="connect-mailbox"]',
    position: 'right',
  },
  {
    id: 'upload_leads',
    title: 'Upload Your Leads',
    description: 'Import your leads CSV here. SmartSend will help you organize and segment them.',
    target: '[data-tour="upload-leads"]',
    position: 'right',
  },
  {
    id: 'create_campaign',
    title: 'Launch Your First Campaign',
    description: 'Create and launch your first cold email campaign here. We\'ll guide you through the process.',
    target: '[data-tour="create-campaign"]',
    position: 'right',
  },
]

export function TourTrigger({ workspaceId, tourSteps = DEFAULT_TOUR_STEPS }: TourTriggerProps) {
  const [showTour, setShowTour] = useState(false)
  const supabase = createClientComponentClient()

  // BLOCK 272500 — Internalization Sprint: coaching UI is OFF by default.
  if (!isCoachingUIEnabled()) return null

  useEffect(() => {
    async function checkTourStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let wsId = workspaceId
        if (!wsId) {
          const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()
          
          wsId = membership?.workspace_id
        }

        if (!wsId) return

        // Check if user has completed onboarding
        const { data: status } = await supabase
          .from('onboarding_status')
          .select('steps, completed')
          .eq('user_id', user.id)
          .eq('workspace_id', wsId)
          .single()

        // Check if tour was already completed
        const tourCompleted = status?.steps?.some(
          (s: { id: string; done: boolean }) => s.id === 'complete_tour' && s.done
        )

        // Show tour if:
        // 1. First time user (no onboarding status)
        // 2. Hasn't completed onboarding
        // 3. Tour not completed
        if (!status || (!status.completed && !tourCompleted)) {
          // Small delay to let page render
          setTimeout(() => {
            setShowTour(true)
          }, 1000)
        }
      } catch (error) {
        console.error('Error checking tour status:', error)
      }
    }

    checkTourStatus()
  }, [supabase, workspaceId])

  if (!showTour) {
    return null
  }

  return (
    <TourOverlay
      steps={tourSteps}
      workspaceId={workspaceId}
      onComplete={() => setShowTour(false)}
      onSkip={() => setShowTour(false)}
    />
  )
}









