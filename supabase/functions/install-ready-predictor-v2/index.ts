// Block 21110 — Install-Ready Predictor v2
// Homeowner Intent + Insurance Status + Deductible Logic + Reply Patterns + Claim Movement
// → Predicts EXACT Install-Ready Moment
//
// This function:
// - Calculates install-ready score (0-100)
// - Triggers actions when score crosses thresholds
// - Creates activity feed events
// - Sends notifications
// - Updates CRM stage
// - Creates calendar events

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InstallReadyScoreResult {
  score: number;
  status: "ready" | "almost_ready" | "not_ready";
  breakdown: {
    homeowner_intent_score: number;
    insurance_status_score: number;
    proposal_score: number;
    deductible_score: number;
    activity_score: number;
    total: number;
  };
  signals: Array<{
    type: string;
    signal: string;
    points: number;
    description: string;
  }>;
  reasons: Array<{ reason: string }>;
  recommended_actions: Array<{
    action: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { thread_id, trigger_reason } = body;

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate install-ready score using database function
    const { data: scoreResult, error: scoreError } = await supabase.rpc(
      "update_install_ready_score_v2",
      {
        p_thread_id: thread_id,
        p_trigger_reason: trigger_reason || "manual_recalculation",
      }
    );

    if (scoreError) {
      console.error("Error calculating score:", scoreError);
      return new Response(
        JSON.stringify({ error: scoreError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const score = scoreResult as InstallReadyScoreResult;

    // Get thread data for context
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        campaign_id,
        contact_id,
        lead_id,
        install_ready_score,
        install_ready_status,
        insurance_carrier,
        insurance_claim_status,
        insurance_deductible_amount,
        insurance_payout_type
      `)
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get previous score for comparison
    const { data: history } = await supabase
      .from("install_ready_score_history")
      .select("score, status")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const previousScore = history?.score || thread.install_ready_score;
    const previousStatus = history?.status || thread.install_ready_status;

    // Create activity feed event for score change
    if (
      previousScore !== score.score ||
      previousStatus !== score.status
    ) {
      await supabase.from("activity_feed_events").insert({
        thread_id: thread_id,
        campaign_id: thread.campaign_id,
        lead_id: thread.lead_id,
        event_type: "install_ready_score_changed",
        event_text: `Install-Ready Score changed from ${previousScore || "N/A"} → ${score.score} (${score.status})`,
        event_payload: {
          previous_score: previousScore,
          new_score: score.score,
          previous_status: previousStatus,
          new_status: score.status,
          trigger_reason: trigger_reason || "automatic_recalculation",
          breakdown: score.breakdown,
          signals: score.signals,
        },
        created_by: "smart_ai",
      });
    }

    // Trigger actions based on score thresholds
    const actions: string[] = [];

    // Score >= 70: Install-Ready
    if (score.score >= 70 && previousScore < 70) {
      // 1. Update CRM stage to INSTALL_READY
      if (thread.campaign_id) {
        // Check if roofing_jobs table exists and has this thread
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("id, job_stage")
          .eq("thread_id", thread_id)
          .single();

        if (job) {
          await supabase
            .from("roofing_jobs")
            .update({ job_stage: "install_ready" })
            .eq("id", job.id);

          actions.push("CRM stage updated to INSTALL_READY");

          // Create activity feed event
          await supabase.from("activity_feed_events").insert({
            thread_id: thread_id,
            campaign_id: thread.campaign_id,
            lead_id: thread.lead_id,
            job_id: job.id,
            event_type: "stage_install_ready",
            event_text: "Job stage updated to Install-Ready (score >= 70)",
            event_payload: {
              score: score.score,
              previous_stage: job.job_stage,
            },
            created_by: "smart_ai",
          });
        }
      }

      // 2. Send notification
      // Get user_id from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id, workspace_id")
        .eq("id", thread.campaign_id)
        .single();

      if (campaign) {
        await supabase.from("notifications").insert({
          user_id: campaign.user_id,
          workspace_id: campaign.workspace_id,
          thread_id: thread_id,
          campaign_id: thread.campaign_id,
          lead_id: thread.lead_id,
          type: "install_ready",
          title: "Homeowner is ready — CALL TODAY",
          body: `Install-Ready Score: ${score.score}/100. ${score.recommended_actions[0]?.action || "Call to schedule install"}`,
          payload: {
            score: score.score,
            status: score.status,
            signals: score.signals,
          },
        });
      }

      actions.push("Notification sent: Homeowner is ready — CALL TODAY");

      // 3. Create calendar event/task
      if (campaign) {
        await supabase.from("calendar_events").insert({
          workspace_id: campaign.workspace_id,
          thread_id: thread_id,
          lead_id: thread.lead_id,
          job_id: job?.id,
          event_type: "TASK",
          title: "Follow up to schedule install",
          description: `Install-Ready Score: ${score.score}/100. Homeowner is ready to book.`,
          event_date: new Date().toISOString().split("T")[0], // Today's date
          status: "scheduled",
          created_by: "AI",
          metadata: {
            score: score.score,
            status: score.status,
          },
        });
      }

      actions.push("Calendar task created: Follow up to schedule install");
    }

    // Score 55-69: Almost Ready
    if (score.score >= 55 && score.score < 70 && previousScore < 55) {
      // Get user_id from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id, workspace_id")
        .eq("id", thread.campaign_id)
        .single();

      if (campaign) {
        // Send notification for almost ready
        await supabase.from("notifications").insert({
          user_id: campaign.user_id,
          workspace_id: campaign.workspace_id,
          thread_id: thread_id,
          campaign_id: thread.campaign_id,
          lead_id: thread.lead_id,
          type: "install_almost_ready",
          title: "Homeowner is almost ready",
          body: `Install-Ready Score: ${score.score}/100. ${score.recommended_actions.map((a) => a.action).join(", ")}`,
          payload: {
            score: score.score,
            status: score.status,
            reasons: score.reasons,
          },
        });
      }

      actions.push("Notification sent: Homeowner is almost ready");
    }

    // Score < 55 but proposal exists and score >= 65: Prompt to send proposal
    if (score.score >= 65 && score.score < 70) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("id, status")
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!proposal || proposal.status !== "sent") {
        // Get user_id from campaign
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("user_id, workspace_id")
          .eq("id", thread.campaign_id)
          .single();

        if (campaign) {
          // Prompt to send proposal
          await supabase.from("notifications").insert({
            user_id: campaign.user_id,
            workspace_id: campaign.workspace_id,
            thread_id: thread_id,
            campaign_id: thread.campaign_id,
            lead_id: thread.lead_id,
            type: "proposal_prompt",
            title: "Send proposal — homeowner is close to booking",
            body: `Install-Ready Score: ${score.score}/100. Homeowner is close to booking. Send proposal to move forward.`,
            payload: {
              score: score.score,
              status: score.status,
            },
          });
        }

        actions.push("Notification sent: Send proposal — homeowner is close to booking");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        score: score.score,
        status: score.status,
        breakdown: score.breakdown,
        signals: score.signals,
        reasons: score.reasons,
        recommended_actions: score.recommended_actions,
        actions_triggered: actions,
        previous_score: previousScore,
        previous_status: previousStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in install-ready-predictor-v2:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

