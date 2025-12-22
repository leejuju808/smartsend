import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LeadRow = {
  id: string;
  campaign_id: string;
  paused_until: string | null;
  paused_reason: string | null;
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: leads, error: viewErr } = await supabase
    .from("v_leads_ooo_expired")
    .select("id,campaign_id,paused_until,paused_reason")
    .limit(1000);

  if (viewErr) return json({ error: viewErr.message }, 500);
  if (!leads?.length) return json({ ok: true, processed: 0 });

  let processed = 0;

  for (const lead of leads as LeadRow[]) {
    const { error: resumeErr } = await supabase.rpc("resume_lead_now", { p_lead: lead.id });
    if (resumeErr) continue;

    const { data: settings } = await supabase
      .from("campaign_settings")
      .select("ooo_resume_delay_hours")
      .eq("campaign_id", lead.campaign_id)
      .maybeSingle();
    const delayHours = settings?.ooo_resume_delay_hours ?? 24;

    const { data: lastEvt } = await supabase
      .from("delivery_events")
      .select("step_id, created_at")
      .eq("campaign_id", lead.campaign_id)
      .eq("lead_id", lead.id)
      .eq("event", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const stepId = lastEvt?.step_id ?? null;

    const sendAfter = new Date(Date.now() + delayHours * 3600 * 1000).toISOString();

    const { data: guard } = await supabase.rpc("can_enqueue_followup", {
      p_campaign: lead.campaign_id,
      p_lead: lead.id
    });

    const ok = Array.isArray(guard) ? guard[0]?.ok : guard?.ok;

    if (ok && stepId) {
      const { error: insErr } = await supabase.from("followup_tasks").insert({
        campaign_id: lead.campaign_id,
        step_id: stepId,
        lead_id: lead.id,
        send_after: sendAfter
      });

      if (insErr) {
        await supabase.from("delivery_events").insert({
          campaign_id: lead.campaign_id,
          lead_id: lead.id,
          step_id: stepId,
          event: "manual_pause",
          meta: { reason: `resume_insert_error: ${insErr.message}` }
        });
      } else {
        await supabase.from("delivery_events").insert({
          campaign_id: lead.campaign_id,
          lead_id: lead.id,
          step_id: stepId,
          event: "manual_pause",
          meta: { action: "auto_resume_and_requeue", delay_hours: delayHours, send_after: sendAfter }
        });
      }
    } else {
      await supabase.from("delivery_events").insert({
        campaign_id: lead.campaign_id,
        lead_id: lead.id,
        step_id: stepId,
        event: "manual_pause",
        meta: { action: "auto_resume", reason: ok ? "no_step" : "guard_blocked" }
      });
    }

    processed++;
  }

  return json({ ok: true, processed });
});

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json" }
  });
}





