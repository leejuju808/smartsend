// SLA Nudge Cron: Finds open threads with unread_count>0 older than 24h
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  // Find threads that need attention: open, unread > 0, last_activity > 24h ago
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: staleThreads, error } = await supabase
    .from('inbox_threads')
    .select('thread_key, user_id, campaign_id, unread_count, last_activity')
    .eq('status', 'open')
    .gt('unread_count', 0)
    .lt('last_activity', twentyFourHoursAgo)
    .limit(100)

  if (error) {
    console.error('Error fetching stale threads:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  if (!staleThreads || staleThreads.length === 0) {
    return new Response(JSON.stringify({ ok: true, count: 0, message: 'No stale threads found' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Log events for analytics (optional: insert into send_logs or events table)
  // For now, we'll just log to console. You can enhance this to write to your analytics table.
  console.log(`Found ${staleThreads.length} threads needing reply (older than 24h)`)

  // Optional: Insert events into send_logs or a dedicated events table
  // Example if you have an events table:
  /*
  const events = staleThreads.map(t => ({
    user_id: t.user_id,
    campaign_id: t.campaign_id,
    event_type: 'nudge_unread_24h',
    metadata: { thread_key: t.thread_key, unread_count: t.unread_count },
    created_at: new Date().toISOString()
  }))
  
  await supabase.from('events').insert(events)
  */

  return new Response(JSON.stringify({ 
    ok: true, 
    count: staleThreads.length,
    threads: staleThreads.map(t => ({ thread_key: t.thread_key, unread_count: t.unread_count }))
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

