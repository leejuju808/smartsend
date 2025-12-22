import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { log_id, user_id } = await req.json()

  if (!log_id || !user_id) {
    return new Response(JSON.stringify({ error: 'Missing log_id or user_id' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Find the log entry
  // Note: send_logs may use workspace_id, so we need to verify user access through workspace membership
  const { data: log, error: logError } = await supabase
    .from('send_logs')
    .select('*')
    .eq('id', log_id)
    .single()

  if (logError || !log) {
    return new Response(JSON.stringify({ error: 'Log not found' }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Verify user has access to this log through workspace membership
  if (log.workspace_id) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', log.workspace_id)
      .eq('user_id', user_id)
      .single()
    
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  } else if (log.user_id && log.user_id !== user_id) {
    // If log has user_id directly, verify it matches
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Get recipient email - prefer recipient_email, fall back to lead lookup
  let recipientEmail = log.recipient_email
  if (!recipientEmail && log.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('email')
      .eq('id', log.lead_id)
      .single()
    
    if (lead?.email) {
      recipientEmail = lead.email
    }
  }

  if (!recipientEmail) {
    return new Response(JSON.stringify({ error: 'Recipient email not found' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Add a fresh entry in queue for resend
  const queueData: any = {
    workspace_id: log.workspace_id,
    campaign_id: log.campaign_id,
    lead_id: log.lead_id,
    recipient_email: recipientEmail,
    status: 'pending',
    scheduled_at: new Date().toISOString()
  }

  // Include subject and body if available
  if (log.subject) queueData.subject = log.subject
  if (log.body) queueData.body = log.body
  if (log.subject_rendered) queueData.subject = log.subject_rendered
  if (log.html_rendered) queueData.body_html = log.html_rendered

  const { error: queueError } = await supabase
    .from('send_queue')
    .insert(queueData)

  if (queueError) {
    return new Response(JSON.stringify({ error: queueError.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Update log (increment retry)
  await supabase
    .from('send_logs')
    .update({ retry_count: (log.retry_count ?? 0) + 1 })
    .eq('id', log_id)

  return new Response(JSON.stringify({ ok: true }), { 
    headers: { 'Content-Type': 'application/json' } 
  })
})

