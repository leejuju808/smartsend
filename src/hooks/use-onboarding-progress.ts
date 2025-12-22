'use client'

import { useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

interface UseOnboardingProgressOptions {
  workspaceId?: string
  autoDetect?: boolean
}

/**
 * Hook to automatically mark onboarding steps as done based on user actions
 */
export function useOnboardingProgress(options: UseOnboardingProgressOptions = {}) {
  const { workspaceId, autoDetect = true } = options
  const supabase = createClientComponentClient()

  const markStepDone = async (stepId: string) => {
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

      await supabase.rpc('mark_onboarding_step_done', {
        p_user_id: user.id,
        p_workspace_id: wsId,
        p_step_id: stepId,
      })
    } catch (error) {
      console.error('Error marking step done:', error)
    }
  }

  useEffect(() => {
    if (!autoDetect) return

    // Auto-detect mailbox connection
    const checkMailbox = async () => {
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

        const { data: accounts } = await supabase
          .from('provider_accounts')
          .select('id')
          .eq('workspace_id', wsId)
          .limit(1)

        if (accounts && accounts.length > 0) {
          await markStepDone('connect_mailbox')
        }
      } catch (error) {
        console.error('Error checking mailbox:', error)
      }
    }

    // Auto-detect leads upload
    const checkLeads = async () => {
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

        const { data: leads } = await supabase
          .from('leads')
          .select('id')
          .eq('workspace_id', wsId)
          .limit(1)

        if (leads && leads.length > 0) {
          await markStepDone('upload_leads')
        }
      } catch (error) {
        console.error('Error checking leads:', error)
      }
    }

    // Auto-detect campaign creation
    const checkCampaign = async () => {
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

        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id')
          .eq('workspace_id', wsId)
          .limit(1)

        if (campaigns && campaigns.length > 0) {
          await markStepDone('create_campaign')
        }
      } catch (error) {
        console.error('Error checking campaign:', error)
      }
    }

    // Run checks on mount
    checkMailbox()
    checkLeads()
    checkCampaign()

    // Set up realtime subscriptions for auto-detection
    const mailboxChannel = supabase
      .channel('onboarding-mailbox')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'provider_accounts',
        },
        () => {
          markStepDone('connect_mailbox')
        }
      )
      .subscribe()

    const leadsChannel = supabase
      .channel('onboarding-leads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
        },
        () => {
          markStepDone('upload_leads')
        }
      )
      .subscribe()

    const campaignChannel = supabase
      .channel('onboarding-campaigns')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaigns',
        },
        () => {
          markStepDone('create_campaign')
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(mailboxChannel)
      supabase.removeChannel(leadsChannel)
      supabase.removeChannel(campaignChannel)
    }
  }, [autoDetect, workspaceId, supabase])

  return { markStepDone }
}









