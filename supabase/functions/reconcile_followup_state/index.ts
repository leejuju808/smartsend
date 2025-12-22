import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Candidate = {
  campaign_id: string;
  lead_id: string;
  meta?: Record<string, any> | null;
};

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: events, error: candidatesError } = await supabase
    .rpc("reconcile_candidates");

  if (candidatesError) {
    console.error("reconcile_followup_state::reconcile_candidates error", candidatesError);
    return new Response(
      JSON.stringify({ ok: false, error: "reconcile_candidates_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const changes = { paused: 0, resumed: 0 };

  for (const r of (events ?? []) as Candidate[]) {
    const label = r.meta?.label as string | undefined;
    const reason = r.meta?.reason as string | undefined;

    const { data: pausedRow, error: pausedErr } = await supabase
      .from("followup_tasks")
      .select("status")
      .eq("campaign_id", r.campaign_id)
      .eq("lead_id", r.lead_id)
      .limit(1)
      .maybeSingle();

    if (pausedErr) {
      console.error("reconcile_followup_state::followup_tasks status error", pausedErr);
      continue;
    }

    const isPaused = pausedRow?.status === "paused";

    if (label === "out_of_office" && !isPaused) {
      const { error: pauseError } = await supabase.rpc("safe_pause_followups", {
        p_campaign_id: r.campaign_id,
        p_lead_id: r.lead_id,
        p_reason: reason ?? "reconcile",
        p_snooze_until: r.meta?.snooze_until ?? null,
      });

      if (pauseError) {
        console.error("reconcile_followup_state::safe_pause_followups error", pauseError);
      } else {
        changes.paused += 1;
      }
    }

    if (label !== "out_of_office" && isPaused) {
      const { error: resumeError } = await supabase.rpc("resume_followups_for_lead", {
        p_campaign_id: r.campaign_id,
        p_lead_id: r.lead_id,
        p_reason: "reconcile",
      });

      if (resumeError) {
        console.error("reconcile_followup_state::resume_followups_for_lead error", resumeError);
      } else {
        changes.resumed += 1;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, changes }),
    { headers: { "Content-Type": "application/json" } },
  );
});





