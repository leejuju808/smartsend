// SmartSend Queue Email Send Edge Function
// Queues emails/messages into send_queue_optimized for background processing

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
    const payload = await req.json();
    const { org_id, workspace_id, type, data, priority = 0, scheduled_for } = payload;

    // Validate required fields
    if (!org_id || !type || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: org_id, type, and data are required' }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate type
    const validTypes = ['email', 'whatsapp', 'sms', 'linkedin'];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert into send_queue_optimized
    const { data: queueItem, error } = await supabase
      .from('send_queue_optimized')
      .insert({
        org_id,
        workspace_id,
        type,
        data,
        status: 'pending',
        priority,
        scheduled_for: scheduled_for || new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      console.error("Queue error:", error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        id: queueItem.id, 
        status: 'queued',
        message: 'Message queued successfully'
      }), 
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

