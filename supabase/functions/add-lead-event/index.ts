// Block 21727 — SmartSend Roofing Lead Timeline v1
// Edge Function — Add Timeline Event
// This will be used EVERYWHERE: When an email is sent, when AI detects a reply,
// when status updates, when follow-up triggers, when a quote is created, when a call is logged

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { lead_id, event_type, event_subtype, message, metadata } =
    await req.json();

  if (!lead_id || !event_type) {
    return new Response("Missing required fields", { status: 400 });
  }

  const { data, error } = await supabase
    .from("lead_timeline_events")
    .insert({
      lead_id,
      event_type,
      event_subtype,
      message,
      metadata
    })
    .select("*");

  if (error) {
    return new Response(JSON.stringify(error), { status: 400 });
  }

  return new Response(JSON.stringify(data[0]), { status: 200 });
});










































