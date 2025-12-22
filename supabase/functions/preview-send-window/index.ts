// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { campaign_id, lead_id, step_no, base, include_jitter = false } = await req.json();
    if (!campaign_id || !lead_id || !step_no) {
      return new Response(
        JSON.stringify({ error: "campaign_id, lead_id, step_no required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    const { data, error } = await supabase.rpc("preview_next_send_for_step", {
      p_campaign: campaign_id,
      p_lead: lead_id,
      p_step_no: step_no,
      p_base: base ?? new Date().toISOString(),
      p_include_jitter: !!include_jitter,
    });
    if (error) throw error;
    return new Response(
      JSON.stringify({ ok: true, preview: data?.[0] }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

