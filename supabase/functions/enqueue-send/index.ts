// SmartSend Enqueue Send Edge Function
// This function allows clients to enqueue emails into outbound_queue

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    const body = await req.json();
    const { org_id, campaign_id, lead_id, to_email, subject, body: html, connector = 'gmail', schedule } = body;

    // Validate required fields
    if (!org_id || !to_email || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: org_id, to_email, subject, and body are required' }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Set scheduled_at (default to now if not provided)
    const scheduled_at = schedule ?? new Date().toISOString();

    // Insert into outbound_queue
    const { data, error } = await supabase
      .from('outbound_queue')
      .insert({
        org_id,
        campaign_id,
        lead_id,
        to_email,
        subject,
        body: html,
        connector,
        scheduled_at,
        status: 'pending'
      })
      .select('*')
      .single();

    if (error) {
      console.error("Enqueue error:", error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ id: data.id, status: 'enqueued' }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

