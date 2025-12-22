// lib/queue/generate.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * Generate send queue for a campaign
 * Uses round-robin mailbox assignment, schedules one email per mailbox every ~90 seconds
 */
export async function generateQueue(campaignId: string): Promise<number> {
  const supabase = createServerComponentClient({ cookies })

  const { data: c } = await supabase.from('campaigns')
    .select('id,user_id,sequence_id,send_start')
    .eq('id', campaignId).single()
  if (!c) throw new Error('Campaign not found')

  const [{ data: leads }, { data: mailboxes }] = await Promise.all([
    supabase.from('leads').select('id,email').eq('campaign_id', campaignId).eq('status','ready'),
    supabase.from('connected_accounts')
      .select('id,provider_email,daily_cap,warmup_day,warmup_started_at,warmup_enabled')
      .eq('user_id', c.user_id)
  ])
  if (!leads?.length || !mailboxes?.length) return 0

  const startTime = c.send_start ? new Date(c.send_start) : new Date()
  const queueRows: any[] = []
  let cursor = startTime.getTime()

  for (let i = 0; i < leads.length; i++) {
    const mailbox = mailboxes[i % mailboxes.length]
    const delay = 90_000 // 1 email per 90 s per mailbox
    const scheduledAt = new Date(cursor + delay * Math.floor(i / mailboxes.length))
    queueRows.push({
      user_id: c.user_id,
      campaign_id: campaignId,
      lead_id: leads[i].id,
      mailbox_id: mailbox.id,
      account_id: mailbox.id, // Set account_id from mailbox
      step_no: 1,
      scheduled_at: scheduledAt.toISOString()
    })
  }

  const { error } = await supabase.from('send_queue').insert(queueRows)
  if (error) throw error
  return queueRows.length
}

