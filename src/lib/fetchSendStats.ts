import { supabaseBrowser } from '@/lib/supabase-browser'

export type SendStats = {
  sent_today: number
  sent_total: number
  failed_today: number
  queue_pending: number
  next_send_at: string | null
}

export async function fetchSendStats(): Promise<SendStats> {
  const sb = supabaseBrowser()
  const { data, error } = await sb.rpc('get_send_stats')
  if (error) throw error
  const row = data?.[0] ?? {}
  return {
    sent_today: row.sent_today ?? 0,
    sent_total: row.sent_total ?? 0,
    failed_today: row.failed_today ?? 0,
    queue_pending: row.queue_pending ?? 0,
    next_send_at: row.next_send_at ?? null,
  }
}

