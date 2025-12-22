// Block 22005 — SmartSend Roofing Job Timeline v2.0
// Edge Function — Create Timeline Event (Unified Creator)
// This is the central timeline brain. Every part of SmartSend calls this when something happens.
//
// Input: { lead_id, event_type, event_category, event_summary, event_data }
//
// This is the unified endpoint for all timeline events.
// All engines will call THIS endpoint.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { 
    lead_id, 
    event_type, 
    event_category, 
    event_summary, 
    event_data 
  } = await req.json();

  if (!lead_id || !event_type) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: lead_id and event_type" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data, error } = await supabase
    .from("job_timelines")
    .insert({
      lead_id,
      event_type,
      event_category: event_category || null,
      event_summary: event_summary || null,
      event_data: event_data || {}
    })
    .select("*")
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

