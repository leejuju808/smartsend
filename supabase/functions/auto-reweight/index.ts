// supabase edge function (deno)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("CRON_SECRET");
    if (url.searchParams.get("secret") !== secret) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const admin = createClient(supabaseUrl, supabaseKey);

    const { data: rules, error } = await admin
      .from("followup_rules")
      .select("campaign_id")
      .eq("auto_reweight_enabled", true);

    if (error) throw error;

    let changedTotal = 0;
    const items: Array<{ campaign_id: string; changed: number }> = [];

    for (const r of rules || []) {
      const { data, error: err2 } = await admin.rpc("nudge_auto_reweight", {
        p_campaign_id: r.campaign_id,
        p_days: 30,
      });

      if (err2) {
        continue;
      }

      const changed = data?.changed || 0;
      changedTotal += changed;
      items.push({ campaign_id: r.campaign_id, changed });
    }

    return new Response(JSON.stringify({ ok: true, changedTotal, items }), {
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e ?? "unknown_error") }),
      { status: 500, headers: corsHeaders },
    );
  }
});

