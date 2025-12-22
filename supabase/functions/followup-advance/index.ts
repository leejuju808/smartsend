import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req) => {
  const sb = createClient(SB_URL, SRK);

  const { data: tasks } = await sb
    .from("followup_tasks")
    .select("id, status, nudge_no, thread_id, campaign_id, lead_id, last_inbound_id, created_at, meta")
    .eq("status", "done")
    .order("created_at", { ascending: true })
    .limit(200);

  let planned = 0;

  for (const t of (tasks || [])) {
    const { data: rule } = await sb.from("followup_rules")
      .select("hours_wait, max_nudges, auto_send, tone, labels, enabled")
      .eq("campaign_id", t.campaign_id).maybeSingle();
    if (!rule || !rule.enabled || !rule.max_nudges || t.nudge_no >= rule.max_nudges) continue;

    const { data: human } = await sb.from("inbox_messages")
      .select("id, created_at").eq("thread_id", t.thread_id)
      .eq("direction", "outbound").not("meta->>sent_by", "eq", "ai")
      .gt("created_at", t.created_at).limit(1);
    if (human && human.length) continue;

    const nextNo = t.nudge_no + 1;
    const { data: exist } = await sb.from("followup_tasks")
      .select("id").eq("thread_id", t.thread_id).eq("nudge_no", nextNo).maybeSingle();
    if (exist) continue;

    const when = new Date(Date.now() + rule.hours_wait * 3600 * 1000).toISOString();

    const { data: guard, error: guardErr } = await sb
      .rpc("can_enqueue_followup", { p_campaign: t.campaign_id, p_lead: t.lead_id });
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
          .eq("id", t.lead_id)
          .maybeSingle();
        pausedUntil = lead?.paused_until ?? null;
      }
      await sb.from("delivery_events").insert({
        thread_id: t.thread_id,
        campaign_id: t.campaign_id,
        lead_id: t.lead_id,
        event: "enqueue_blocked",
        meta: { reason: guardRow?.reason ?? null, paused_until: pausedUntil }
      });
      continue;
    }

    const { error: insertErr } = await sb.from("followup_tasks").insert({
      scheduled_at: when,
      campaign_id: t.campaign_id,
      thread_id: t.thread_id,
      lead_id: t.lead_id,
      last_inbound_id: t.last_inbound_id,
      nudge_no: nextNo,
      meta: { auto_send: rule.auto_send, tone: rule.tone, labels: rule.labels }
    });
    if (insertErr) {
      if ((insertErr.message ?? "").includes("enqueue_blocked")) {
        await sb.from("delivery_events").insert({
          thread_id: t.thread_id,
          campaign_id: t.campaign_id,
          lead_id: t.lead_id,
          event: "enqueue_blocked",
          meta: { reason: "db_blocked", detail: insertErr.message }
        });
        continue;
      }
      throw insertErr;
    }
    planned++;
  }

  return new Response(JSON.stringify({ ok: true, planned }), {
    headers: { "content-type": "application/json" }
  });
});


