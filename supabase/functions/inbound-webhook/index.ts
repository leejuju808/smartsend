import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

serve(async (req) => {
  try {
    const payload = await req.json();
    const {
      provider,
      event,
      to,
      campaign_id: campaignId,
      lead_id: leadId,
    } = payload ?? {};

    await supabase.from("delivery_events").insert({
      provider,
      event,
      to_email: (to ?? "")?.toLowerCase?.(),
      campaign_id: campaignId,
      lead_id: leadId,
      meta: payload ?? {},
    });

    if ((event === "bounce" || event === "complaint") && leadId) {
      await supabase.rpc("suppress_lead", {
        p_lead_id: leadId,
        p_reason: event,
        p_scope: "account",
        p_source: provider ?? "webhook",
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("inbound-webhook error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
});
