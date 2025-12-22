import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type OnBump = (hint?: 'logs' | 'queue') => void

export function useSendRealtime(onBump: OnBump) {
  useEffect(() => {
    const sb = supabaseBrowser()

    const logs = sb
      .channel('realtime:send_logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'send_logs' },
        () => onBump('logs')
      )
      .subscribe()

    const queue = sb
      .channel('realtime:send_queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'send_queue' },
        () => onBump('queue')
      )
      .subscribe()

    return () => {
      sb.removeChannel(logs)
      sb.removeChannel(queue)
    }
  }, [onBump])
}

