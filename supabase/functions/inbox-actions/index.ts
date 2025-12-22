import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const { action, lead_id, thread_id } = await req.json().catch(() => ({}))
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (action === 'resume_lead' && lead_id) {
    const { error } = await supabase.rpc('resume_lead_now', { p_lead: lead_id })
    if (error) return json({ error: error.message }, 500)

    await supabase
      .from('delivery_events')
      .insert({ lead_id, event: 'manual_pause', meta: { action: 'resume' } })

    return json({ ok: true })
  }

  if (action === 'mark_replied' && thread_id) {
    const { error } = await supabase
      .from('inbox_threads')
      .update({ replied_at: new Date().toISOString() })
      .eq('id', thread_id)
    if (error) return json({ error: error.message }, 500)

    return json({ ok: true })
  }

  return json({ error: 'Bad request' }, 400)
})

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}





