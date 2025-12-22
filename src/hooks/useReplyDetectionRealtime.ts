'use client'

/**
 * Hook that refreshes inbox UI when a reply is detected via AI
 * Listens to campaign_leads.has_replied changes and triggers a refresh callback
 */
import { useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

type OnReplyDetected = (payload: { leadId: string; campaignLeadId: string; isReply: boolean }) => void

export function useReplyDetectionRealtime(onReplyDetected: OnReplyDetected) {
  useEffect(() => {
    const supabase = createClientComponentClient()

    const channel = supabase
      .channel('reply-detection-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_leads',
          filter: 'has_replied=eq.true', // Only listen when has_replied becomes true
        },
        (payload) => {
          const newRow = payload.new as any
          const oldRow = payload.old as any

          // Only trigger if has_replied changed from false to true
          if (!oldRow?.has_replied && newRow?.has_replied && newRow?.lead_id) {
            onReplyDetected({
              leadId: newRow.lead_id,
              campaignLeadId: newRow.id,
              isReply: true,
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Reply detection realtime: subscribed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [onReplyDetected])
}

