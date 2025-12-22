import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: { campaign_id?: string; lead_id?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const campaign_id = body.campaign_id;
  const lead_id = body.lead_id;
  const reason = body.reason ?? "manual_unpause";

  if (!campaign_id || !lead_id) {
    return new Response(JSON.stringify({ ok: false, error: "campaign_id and lead_id required" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.rpc("resume_followups_for_lead", {
    p_campaign_id: campaign_id,
    p_lead_id: lead_id,
    p_reason: reason,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});






