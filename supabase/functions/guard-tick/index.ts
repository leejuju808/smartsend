// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function getSettings(user_id: string | null) {
  // Try user-specific then global default
  if (user_id) {
    const { data } = await supabase
      .from("deliverability_settings")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("deliverability_settings")
    .select("*")
    .is("user_id", null)
    .maybeSingle();
  return data!;
}

Deno.serve(async (_req) => {
  // 1) Pull campaigns + owners + paused flags
  const { data: camps, error } = await supabase
    .from("campaigns")
    .select("id,user_id,paused_by_guard,pause_reason,status");
  if (error) return new Response(error.message, { status: 500 });

  let paused = 0, resumed = 0;

  for (const c of camps ?? []) {
    const s = await getSettings(c.user_id);
    if (!s) {
      console.warn(`No settings found for campaign ${c.id}, skipping`);
      continue;
    }

    const { data: health } = await supabase
      .from("v_campaign_health_7d")
      .select("*")
      .eq("campaign_id", c.id)
      .maybeSingle();

    const sent = Number(health?.sent_7d ?? 0);
    const br = Number(health?.bounce_rate_7d ?? 0);
    const sr = Number(health?.spam_rate_7d ?? 0);

    // Skip if not enough sample
    if (sent < Number(s.min_sample_sent)) {
      // Optionally resume small-sample paused campaigns
      if (c.paused_by_guard) {
        await supabase.rpc("guard_resume_campaign", { p_campaign: c.id });
        await supabase.rpc("log_audit", {
          p_actor: null,
          p_campaign: c.id,
          p_entity_type: "campaign",
          p_entity: c.id,
          p_action: "guard_resume",
          p_meta: { reason: "low_sample", sent, br, sr }
        });
        resumed++;
      }
      continue;
    }

    const shouldPause = (br > Number(s.bounce_threshold)) || (sr > Number(s.spam_threshold));
    const shouldResume =
      (br < Number(s.bounce_threshold) * Number(s.resume_padding)) &&
      (sr < Number(s.spam_threshold) * Number(s.resume_padding));

    if (shouldPause && !c.paused_by_guard) {
      const reason = br > s.bounce_threshold ? "bounce_high" : "spam_high";
      await supabase.rpc("guard_pause_campaign", { p_campaign: c.id, p_reason: reason });
      await supabase.rpc("log_audit", {
        p_actor: null,
        p_campaign: c.id,
        p_entity_type: "campaign",
        p_entity: c.id,
        p_action: "guard_pause",
        p_meta: { reason, sent, br, sr, thresholds: s }
      });
      paused++;
    } else if (shouldResume && c.paused_by_guard) {
      await supabase.rpc("guard_resume_campaign", { p_campaign: c.id });
      await supabase.rpc("log_audit", {
        p_actor: null,
        p_campaign: c.id,
        p_entity_type: "campaign",
        p_entity: c.id,
        p_action: "guard_resume",
        p_meta: { sent, br, sr, thresholds: s }
      });
      resumed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, paused, resumed }), { 
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});



