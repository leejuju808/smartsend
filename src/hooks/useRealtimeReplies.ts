'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { InboxThread } from '@/lib/types'

type Params = {
  onRowUpdate: (row: Partial<InboxThread> & { id: string }) => void
}

export function useRealtimeReplies({ onRowUpdate }: Params) {
  useEffect(() => {
    const supabase = supabaseBrowser()

    const channel = supabase
      .channel('campaign_logs_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaign_logs' },
        (payload) => {
          // Only forward fields we care about
          const newRow = payload.new as any
          onRowUpdate({
            id: newRow.id,
            replied: newRow.replied,
            last_message_at: newRow.last_message_at,
          })
        }
      )
      .subscribe((status) => {
        // optional: console.log('Realtime status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [onRowUpdate])
}

