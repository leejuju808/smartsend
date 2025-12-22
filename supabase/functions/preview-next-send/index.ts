// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

Deno.serve(async (req) => {
  try {
    const { campaign_id, step_no, lead_id, lead_ids, base, include_jitter = true } = await req.json();
    if (!campaign_id || !step_no || (!lead_id && !(lead_ids?.length))) {
      return new Response("campaign_id, step_no and lead_id(s) required", { status: 400 });
    }
    const p_base = base ? new Date(base).toISOString() : undefined;

    if (lead_id) {
      const { data, error } = await sb.rpc("preview_next_send_for_step", {
        p_campaign: campaign_id, p_step_no: step_no, p_lead: lead_id,
        p_base: p_base, p_include_jitter: include_jitter
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok:true, rows: data ?? [] }), { headers:{ "content-type":"application/json" } });
    } else {
      const { data, error } = await sb.rpc("preview_next_send_for_step_many", {
        p_campaign: campaign_id, p_step_no: step_no, p_leads: lead_ids,
        p_base: p_base, p_include_jitter: include_jitter
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok:true, rows: data ?? [] }), { headers:{ "content-type":"application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});

























