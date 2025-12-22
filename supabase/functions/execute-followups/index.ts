import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async () => {
  const { data: tasks, error } = await supabase
    .from("followup_tasks")
    .select("id, lead_id, variant_id, due_at, status, paused, done")
    .eq("kind", "ooo_autonudge")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const t of tasks ?? []) {
    const { data: ok } = await supabase.rpc("should_send_autonudge", { p_lead_id: t.lead_id });
    if (!ok) {
      await supabase.from("followup_tasks").update({ status: "skipped" }).eq("id", t.id);
      skipped++;
      continue;
    }

    const { data: variant } = await supabase
      .from("nudge_variants")
      .select("subject, body")
      .eq("id", t.variant_id)
      .single();

    if (!variant) {
      await supabase.from("followup_tasks").update({ status: "skipped" }).eq("id", t.id);
      skipped++;
      continue;
    }

    const { data: ctx } = await supabase
      .from("leads")
      .select("id, email, campaign_id, campaigns!inner(owner_id)")
      .eq("id", t.lead_id)
      .single();

    if (!ctx) {
      await supabase.from("followup_tasks").update({ status: "skipped" }).eq("id", t.id);
      skipped++;
      continue;
    }

    const { data: blocked } = await supabase.rpc("is_suppressed", {
      p_campaign_id: ctx.campaign_id,
      p_account_id: (ctx as any).campaigns.owner_id,
      p_email: ctx.email,
    });

    if (blocked) {
      await supabase.from("followup_tasks").update({ status: "skipped" }).eq("id", t.id);
      skipped++;
      continue;
    }

    const { data: sendId, error: sendErr } = await supabase.rpc("enqueue_send", {
      p_campaign_id: ctx.campaign_id,
      p_account_id: (ctx as any).campaigns.owner_id,
      p_lead_id: t.lead_id,
      p_to: ctx.email,
      p_subject: variant.subject,
      p_body: variant.body,
    });

    if (sendErr || !sendId) {
      await supabase.from("followup_tasks").update({ status: "skipped" }).eq("id", t.id);
      skipped++;
      continue;
    }

    await supabase.from("followup_tasks").update({ status: "sent", done: true }).eq("id", t.id);
    sent++;
  }

  return new Response(JSON.stringify({ sent, skipped }), { status: 200 });
});





