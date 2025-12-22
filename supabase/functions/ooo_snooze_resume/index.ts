import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("followup_tasks")
    .select("campaign_id, lead_id")
    .eq("status", "paused")
    .eq("reason", "ooo_auto")
    .lte("snooze_until", nowIso)
    .not("snooze_until", "is", null)
    .limit(500);

  if (error || !rows?.length) {
    if (error) {
      console.error("ooo_snooze_resume::query error", error);
    }
    return new Response(
      JSON.stringify({ resumed: 0 }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const key = (r: { campaign_id: number | string; lead_id: number | string }) =>
    `${r.campaign_id}:${r.lead_id}`;
  const pairs = Array.from(new Map(rows.map((r) => [key(r), r])).values());

  let count = 0;

  for (const r of pairs) {
    const { error: rpcErr } = await supabase.rpc(
      "resume_followups_for_lead",
      {
        p_campaign_id: r.campaign_id,
        p_lead_id: r.lead_id,
        p_reason: "snooze_until_elapsed",
      },
    );

    if (rpcErr) {
      console.error("ooo_snooze_resume::resume error", rpcErr, r);
      continue;
    }

    await supabase
      .from("followup_tasks")
      .update({ snooze_until: null })
      .eq("campaign_id", r.campaign_id)
      .eq("lead_id", r.lead_id)
      .eq("status", "paused");

    await supabase.from("delivery_events").insert({
      campaign_id: r.campaign_id,
      lead_id: r.lead_id,
      type: "ooo_auto_resume",
      meta: { reason: "snooze_until_elapsed" },
    });

    count++;
  }

  return new Response(
    JSON.stringify({ resumed: count }),
    { headers: { "content-type": "application/json" } },
  );
});





