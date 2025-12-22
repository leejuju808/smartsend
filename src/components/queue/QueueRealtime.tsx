'use client'

import { useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function QueueRealtime({ onChange }: { onChange: () => void }) {
  useEffect(() => {
    const sb = createClientComponentClient()
    const ch = sb
      .channel('queue-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'send_queue' },
        (_payload) => onChange()
      )
    
    ch.subscribe()
    
    return () => {
      sb.removeChannel(ch)
    }
  }, [onChange])
  
  return null
}

