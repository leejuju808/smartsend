// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyApiKey } from "../_lib/apiAuth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  const endpoint = "api-campaign-trigger";
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const apiKey = req.headers.get("x-api-key") ?? "";
    const auth = await verifyApiKey(supabase, apiKey);
    if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "content-type":"application/json" } });

    const { data: okRate } = await supabase.rpc("api_rate_ok", { p_api_key: auth.key!.id, p_limit: 60 });
    if (!okRate) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type":"application/json" } });

    const body = await req.json();
    const { campaign_id, lead_ids = [], start_at = new Date().toISOString() } = body;
    if (!campaign_id || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return new Response(JSON.stringify({ error: "campaign_id and lead_ids[] required" }), { status: 400, headers: { "content-type":"application/json" } });
    }

    for (const lid of lead_ids) {
      await supabase.rpc("enqueue_first_campaign_step", {
        p_campaign: campaign_id,
        p_lead: lid,
        p_start_at: start_at
      });
    }

    await supabase.rpc("record_api_call", { p_api_key: auth.key!.id, p_endpoint: endpoint, p_ok: true });
    return new Response(JSON.stringify({ ok: true, enqueued: lead_ids.length }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    try {
      const apiKey = req.headers.get("x-api-key") ?? "";
      const auth = await verifyApiKey(supabase, apiKey);
      if (auth.ok) await supabase.rpc("record_api_call", { p_api_key: auth.key!.id, p_endpoint: "api-campaign-trigger", p_ok: false });
    } catch {}
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});


