import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

Deno.serve(async () => {
  // find steps with ab_enabled and at least 2 enabled variants
  const { data: steps } = await sb.from("campaign_steps")
    .select("campaign_id, step_no, ab_min_sample")
    .eq("ab_enabled", true);

  if (!steps || steps.length === 0) {
    return new Response(JSON.stringify({ ok:true, promoted: [] }), { headers:{ "content-type":"application/json" } });
  }

  let promoted: any[] = [];
  for (const s of steps) {
    // detect variant count
    const { count } = await sb.from("campaign_step_variants")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", s.campaign_id)
      .eq("step_no", s.step_no)
      .eq("enabled", true);
    
    if ((count ?? 0) < 2) continue;

    const { data: winner } = await sb.rpc("promote_winner_variant", { 
      p_campaign: s.campaign_id, 
      p_step: s.step_no 
    });
    
    if (winner) {
      promoted.push({ campaign: s.campaign_id, step: s.step_no, winner });
    }
  }

  return new Response(JSON.stringify({ ok:true, promoted }), { headers:{ "content-type":"application/json" } });
});

