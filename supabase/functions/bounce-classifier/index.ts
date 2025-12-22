// Block 18: Bounce Classifier Edge Function
// SmartSend — Bounce Classifier that parses NDR/auto-replies and auto-suppresses hard bounces

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { parseBounce } from "../_shared/bounce-parser.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { workspace_id, recipient_email, subject, body, from_email, message_id } = await req.json()

    if (!workspace_id || !recipient_email) {
      return new Response(
        JSON.stringify({ ok: false, error: 'workspace_id and recipient_email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse bounce using shared parser
    const parsed = parseBounce(subject, body, from_email)

    if (!parsed.isBounce) {
      return new Response(
        JSON.stringify({ ok: true, classified: false, reason: 'not_a_bounce' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Record bounce event
    const { data: bounceEvent, error: bounceError } = await supabaseAdmin
      .from('bounce_events')
      .insert({
        workspace_id,
        recipient_email: recipient_email.toLowerCase(),
        bounce_type: parsed.type === 'hard' ? 'hard' : parsed.type === 'soft' ? 'soft' : 'transient',
        bounce_code: null,
        bounce_reason: parsed.reason,
        raw_message: body || subject || '',
        original_message_id: message_id || null,
        processed: false,
      })
      .select()
      .single()

    if (bounceError) {
      console.error('Error inserting bounce event:', bounceError)
    }

    // Auto-suppress hard bounces (Block 445)
    if (parsed.type === 'hard') {
      // Use Block 445 suppression function
      const { error: suppressError } = await supabaseAdmin.rpc('auto_suppress_from_bounce', {
        p_workspace_id: workspace_id,
        p_email: recipient_email.toLowerCase(),
        p_bounce_type: 'hard',
        p_reason: parsed.reason || 'Hard bounce'
      })

      if (suppressError) {
        console.error('Error suppressing email:', suppressError)
      } else {
        // Mark bounce event as processed
        if (bounceEvent?.id) {
          await supabaseAdmin
            .from('bounce_events')
            .update({ processed: true, suppressed_at: new Date().toISOString() })
            .eq('id', bounceEvent.id)
        }

        return new Response(
          JSON.stringify({
            ok: true,
            classified: true,
            bounce_type: 'hard',
            suppressed: true,
            bounce_event_id: bounceEvent?.id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Soft bounces - log but don't suppress
    return new Response(
      JSON.stringify({
        ok: true,
        classified: true,
        bounce_type: parsed.type,
        suppressed: false,
        bounce_event_id: bounceEvent?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Bounce classifier error:', error)
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

