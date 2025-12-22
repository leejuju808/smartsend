'use server'

import { createClient } from '@supabase/supabase-js'
import { InboxThread } from '@/lib/types'

export async function loadInbox(): Promise<InboxThread[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side
  )

  // Adjust SELECT to match your columns
  const { data, error } = await supabase
    .from('campaign_logs')
    .select('id,email_id,campaign_id,subject,from_email,to_email,last_message_at,replied,reply_type')
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []) as InboxThread[]
}

