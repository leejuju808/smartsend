import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req) => {
  const sb = createClient(SB_URL, SRK);

  const { data: rules, error: rulesErr } = await sb
    .from("followup_rules")
    .select("campaign_id, labels, hours_wait, max_nudges, auto_send, tone, enabled")
    .eq("enabled", true);

  if (rulesErr) {
    return new Response(JSON.stringify({ ok: false, error: rulesErr.message }), {
      headers: { "content-type": "application/json" }
    });
  }

  let planned = 0;

  for (const r of (rules || [])) {
    const { data: rows } = await sb
      .from("v_thread_status")
      .select("thread_id, campaign_id, lead_id, last_in_at, last_in_id, last_in_label, last_human_out_at")
      .eq("campaign_id", r.campaign_id);

    for (const x of (rows || [])) {
      if (!x.last_in_id) continue;
      if (!r.labels?.includes(x.last_in_label)) continue;

      if (x.last_human_out_at && new Date(x.last_human_out_at) > new Date(x.last_in_at)) continue;

      const { data: existing } = await sb.from("followup_tasks")
        .select("id,status").eq("thread_id", x.thread_id).eq("nudge_no", 1).maybeSingle();
      if (existing) continue;

      const when = new Date(new Date(x.last_in_at).getTime() + r.hours_wait * 3600 * 1000).toISOString();

      const { data: guard, error: guardErr } = await sb
        .rpc("can_enqueue_followup", { p_campaign: x.campaign_id, p_lead: x.lead_id });
      if (guardErr) {
        throw guardErr;
      }
      const guardRow = Array.isArray(guard) ? guard?.[0] ?? null : guard ?? null;
      if (!guardRow?.ok) {
        let pausedUntil: string | null = null;
        if (guardRow?.reason === "paused_until") {
          const { data: lead } = await sb
            .from("campaign_leads")
            .select("paused_until")
            .eq("id", x.lead_id)
            .maybeSingle();
          pausedUntil = lead?.paused_until ?? null;
        }
        await sb.from("delivery_events").insert({
          thread_id: x.thread_id,
          campaign_id: x.campaign_id,
          lead_id: x.lead_id,
          event: "enqueue_blocked",
          meta: { reason: guardRow?.reason ?? null, paused_until: pausedUntil }
        });
        continue;
      }

      const { error: insertErr } = await sb.from("followup_tasks").insert({
        scheduled_at: when,
        campaign_id: x.campaign_id,
        thread_id: x.thread_id,
        lead_id: x.lead_id,
        last_inbound_id: x.last_in_id,
        nudge_no: 1,
        meta: { auto_send: r.auto_send, tone: r.tone, labels: r.labels }
      });
      if (insertErr) {
        if ((insertErr.message ?? "").includes("enqueue_blocked")) {
          await sb.from("delivery_events").insert({
            thread_id: x.thread_id,
            campaign_id: x.campaign_id,
            lead_id: x.lead_id,
            event: "enqueue_blocked",
            meta: { reason: "db_blocked", detail: insertErr.message }
          });
          continue;
        }
        throw insertErr;
      }
      planned++;
    }
  }

  return new Response(JSON.stringify({ ok: true, planned }), {
    headers: { "content-type": "application/json" }
  });
});


