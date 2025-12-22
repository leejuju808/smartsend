import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BranchCond =
  | { intent?: string }
  | { lead_score?: { ">="?: number; "<"?: number } }
  | { no_open_since_hours?: number };

function matchCond(ctx: any, cond: BranchCond): boolean {
  if ("intent" in cond && cond.intent) {
    return (ctx.last_intent ?? null) === cond.intent;
  }

  if ("lead_score" in cond) {
    const score = ctx.lead_score ?? 0;
    const ge = cond.lead_score?.[">="];
    const lt = cond.lead_score?.["<"];
    if (ge !== undefined && score < ge) return false;
    if (lt !== undefined && score >= lt) return false;
  }

  if ("no_open_since_hours" in cond) {
    const threshold = cond.no_open_since_hours!;
    const lastOpen = ctx.last_open_at
      ? Date.now() - new Date(ctx.last_open_at).getTime()
      : Number.POSITIVE_INFINITY;
    if (!(lastOpen / 3_600_000 >= threshold)) return false;
  }

  return true;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: states, error: stateError } = await supabase
    .from("followup_state")
    .select("lead_id,campaign_id,sequence_id,current_step,last_outbound_at,is_done")
    .eq("is_done", false)
    .limit(2000);

  if (stateError) {
    return new Response(
      JSON.stringify({ error: stateError.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!states?.length) {
    return new Response(
      JSON.stringify({ scheduled: 0 }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  let scheduled = 0;

  for (const s of states) {
    const { data: step } = await supabase
      .from("followup_steps")
      .select("id,step_order,delay_hours,template_id,send_window_start,send_window_end,stop_on_reply,stop_on_meeting")
      .eq("sequence_id", s.sequence_id)
      .gt("step_order", s.current_step)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!step) {
      await supabase
        .from("followup_state")
        .update({ is_done: true })
        .eq("lead_id", s.lead_id)
        .eq("sequence_id", s.sequence_id);
      continue;
    }

    const { data: react } = await supabase
      .from("v_lead_recent_activity")
      .select("last_reaction_at")
      .eq("lead_id", s.lead_id)
      .eq("campaign_id", s.campaign_id)
      .maybeSingle();

    const lastReact = react?.last_reaction_at
      ? new Date(react.last_reaction_at).getTime()
      : -1;
    const lastOutbound = s.last_outbound_at
      ? new Date(s.last_outbound_at).getTime()
      : -1;

    if ((step.stop_on_reply || step.stop_on_meeting) && lastReact > lastOutbound) {
      await supabase
        .from("followup_state")
        .update({ is_done: true })
        .eq("lead_id", s.lead_id)
        .eq("sequence_id", s.sequence_id);
      continue;
    }

    const { data: branches } = await supabase
      .from("followup_branches")
      .select("condition,goto_step")
      .eq("step_id", step.id);

    if (branches?.length) {
      const [leadScoreResult, threadResult] = await Promise.all([
        supabase
          .from("lead_scores")
          .select("score,updated_at")
          .eq("lead_id", s.lead_id)
          .maybeSingle(),
        supabase
          .from("threads")
          .select("last_intent,last_intent_confidence,last_open_at")
          .eq("lead_id", s.lead_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      const ctx = {
        lead_score: leadScoreResult.data?.score ?? 0,
        last_intent: threadResult.data?.last_intent ?? null,
        last_open_at: threadResult.data?.last_open_at ?? null
      };

      const hit = branches.find((b: any) => matchCond(ctx, b.condition as BranchCond));

      if (hit) {
        await supabase
          .from("followup_state")
          .update({ current_step: hit.goto_step - 1 })
          .eq("lead_id", s.lead_id)
          .eq("sequence_id", s.sequence_id);
        continue;
      }
    }

    const priorOutbound = s.last_outbound_at
      ? new Date(s.last_outbound_at).getTime()
      : Date.now();
    const delayMs = (step.delay_hours ?? 0) * 3_600_000;
    const baseTime = new Date(Math.max(Date.now(), priorOutbound + delayMs));

    const { data: ts, error: nextError } = await supabase.rpc("next_send_time", {
      p_campaign: s.campaign_id,
      p_base: baseTime.toISOString(),
      p_local_hour_start: step.send_window_start ?? 8,
      p_local_hour_end: step.send_window_end ?? 17
    });

    if (nextError) {
      await supabase
        .from("followup_outbox")
        .insert({
          campaign_id: s.campaign_id,
          lead_id: s.lead_id,
          sequence_id: s.sequence_id,
          step_id: step.id,
          scheduled_for: baseTime.toISOString(),
          status: "error",
          reason: `next_send_time error: ${nextError.message}`
        });
      continue;
    }

    const scheduled_for = ts as unknown as string;

    await supabase.from("followup_outbox").insert({
      campaign_id: s.campaign_id,
      lead_id: s.lead_id,
      sequence_id: s.sequence_id,
      step_id: step.id,
      scheduled_for
    });

    await supabase
      .from("followup_state")
      .update({ current_step: step.step_order, last_outbound_at: scheduled_for })
      .eq("lead_id", s.lead_id)
      .eq("sequence_id", s.sequence_id);

    // Log scheduler dispatch to activity_log
    try {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id, workspace_id, org_id")
        .eq("id", s.campaign_id)
        .maybeSingle();
      
      const account_id = campaign?.account_id || campaign?.workspace_id || campaign?.org_id;
      
      if (account_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("company_id")
          .eq("id", s.lead_id)
          .maybeSingle();
        
        await supabase.from("activity_log").insert({
          account_id,
          campaign_id: s.campaign_id,
          company_id: lead?.company_id || null,
          lead_id: s.lead_id,
          event_type: "scheduler_dispatch",
          meta: { 
            scheduled_for,
            step_id: step.id,
            sequence_id: s.sequence_id,
            best_hour: new Date(scheduled_for).getHours()
          },
        });
      }
    } catch (activityErr) {
      console.error("Failed to log scheduler dispatch activity:", activityErr);
    }

    scheduled++;
  }

  return new Response(
    JSON.stringify({ scheduled }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
});




