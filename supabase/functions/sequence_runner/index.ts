import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async () => {
  const { createClient } = await import("npm:@supabase/supabase-js")
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })

  // 1) claim due enrollments
  const { data: due } = await sb.from('sequence_enrollments')
    .select('id, project_id, thread_id, sequence_id, current_step')
    .eq('status','active')
    .lte('next_run_at', new Date().toISOString())
    .limit(25)

  if (!due?.length) return new Response('empty', { status:200 })

  for (const row of due) {
    // Check if thread is suppressed
    const { data: thr } = await sb.from('threads').select('suppressed, delivery_status').eq('id', row.thread_id).single()
    if (thr?.suppressed) {
      await sb.from('sequence_enrollments').update({ status:'paused', last_error:`suppressed:${thr.delivery_status}` }).eq('id', row.id)
      continue
    }

    // next step = current_step + 1
    const nextStep = (row.current_step ?? 0) + 1

    // fetch step content
    const { data: step } = await sb.from('sequence_steps')
      .select('subject, body, delay_minutes')
      .eq('sequence_id', row.sequence_id)
      .eq('step_number', nextStep)
      .single()

    if (!step) {
      // no more steps -> complete
      await sb.from('sequence_enrollments').update({ status:'completed', next_run_at:null }).eq('id', row.id)
      continue
    }

    // thread -> find lead email + any sender identity you use
    const { data: threadJoin } = await sb
      .from('threads')
      .select('id, project_id, lead_id')
      .eq('id', row.thread_id)
      .single()

    if (!threadJoin?.lead_id) {
      await sb.from('sequence_enrollments').update({ status:'error', last_error:'Thread or lead not found' }).eq('id', row.id)
      continue
    }

    const { data: lead } = await sb
      .from('leads')
      .select('email')
      .eq('id', threadJoin.lead_id)
      .single()

    if (!lead?.email) {
      await sb.from('sequence_enrollments').update({ status:'error', last_error:'Lead email not found' }).eq('id', row.id)
      continue
    }

    const recipient = lead.email
    const sender = 'sales@smartsendhq.com' // adapt to your identity

    // insert outbound email -> existing outbox/worker will deliver
    const { error: insErr } = await sb.from('emails').insert({
      project_id: row.project_id,
      thread_id: row.thread_id,
      direction: 'outbound',
      subject: step.subject,
      body: step.body,
      sender,
      recipient
    })
    if (insErr) {
      await sb.from('sequence_enrollments').update({ status:'error', last_error:insErr.message }).eq('id', row.id)
      continue
    }

    // schedule next step
    const nextRun = step.delay_minutes
      ? new Date(Date.now() + step.delay_minutes * 60 * 1000).toISOString()
      : null

    const upd = nextRun
      ? { current_step: nextStep, next_run_at: nextRun }
      : { current_step: nextStep, status:'completed', next_run_at: null }

    await sb.from('sequence_enrollments').update(upd).eq('id', row.id)
  }

  return new Response('ok', { status:200 })
})
