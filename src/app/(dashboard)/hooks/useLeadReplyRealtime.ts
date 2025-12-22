'use client'

import { useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type OnReply = (payload: { leadId: string }) => void

export function useLeadReplyRealtime(onReply: OnReply) {
  useEffect(() => {
    const supabase = createClientComponentClient()

    // Listen for any status update and check if it became 'replied' (case-insensitive)
    const channel = supabase
      .channel('lead-replies')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'leads'
        },
        (payload: any) => {
          const leadId = payload.new?.id as string
          const newStatus = String(payload.new?.status || '').toLowerCase()
          const oldStatus = String(payload.old?.status || '').toLowerCase()
          
          // Only fire if status changed to 'replied' (case-insensitive)
          if (leadId && newStatus === 'replied' && oldStatus !== 'replied') {
            onReply({ leadId })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [onReply])
}

