import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Block 8880 — Pipeline/Lead Score Handler
 * Processes pipeline stage changes and lead score updates
 * 
 * This function should be called when:
 * - Pipeline stage changes (New → Quoted → Won/Lost)
 * - Lead score updates
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      contact_id,
      campaign_id,
      pipeline_stage,
      lead_score,
      account_id,
      previous_stage,
      previous_score,
    } = body;

    if (!contact_id || !campaign_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: contact_id, campaign_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(
      `Processing pipeline/score update for contact ${contact_id}, campaign ${campaign_id}, stage: ${pipeline_stage}, score: ${lead_score}`
    );

    // Get account_id from campaign if not provided
    let finalAccountId = account_id;
    if (!finalAccountId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id")
        .eq("id", campaign_id)
        .single();

      if (campaign) {
        finalAccountId = campaign.account_id;
      }
    }

    if (!finalAccountId) {
      return new Response(
        JSON.stringify({ error: "Could not determine account_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 1. Get or create stats record
    const { data: stats, error: statsError } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("contact_id", contact_id)
      .maybeSingle();

    if (statsError) {
      console.error("Failed to fetch stats:", statsError);
    }

    // Update stats with pipeline stage and lead score
    const statsUpdate: any = {
      account_id: finalAccountId,
      campaign_id,
      contact_id,
    };

    if (pipeline_stage !== undefined) {
      statsUpdate.current_pipeline_stage = pipeline_stage;
    }

    if (lead_score !== undefined) {
      statsUpdate.current_lead_score = lead_score;
    }

    if (!stats) {
      await supabase.from("lead_auto_follow_up_stats").insert(statsUpdate);
    } else {
      await supabase
        .from("lead_auto_follow_up_stats")
        .update(statsUpdate)
        .eq("id", stats.id);
    }

    // 2. Get follow-up program for this campaign
    const { data: program, error: programError } = await supabase
      .from("follow_up_programs")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("is_enabled", true)
      .maybeSingle();

    if (programError || !program) {
      console.log(`No follow-up program found for campaign ${campaign_id}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "No follow-up program found for this campaign",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 3. Process pipeline stage rules
    if (pipeline_stage) {
      const { data: pipelineRules, error: pipelineError } = await supabase
        .from("follow_up_rules")
        .select("*")
        .eq("program_id", program.id)
        .eq("type", "pipeline_stage")
        .eq("is_enabled", true);

      if (pipelineRules && pipelineRules.length > 0) {
        for (const rule of pipelineRules) {
          // Check if stage matches
          const stageMatches =
            rule.pipeline_stage_to &&
            rule.pipeline_stage_to.toLowerCase() === pipeline_stage.toLowerCase();

          if (stageMatches) {
            // Check if we should stop follow-ups (won/lost)
            if (
              pipeline_stage.toLowerCase() === "won" ||
              pipeline_stage.toLowerCase() === "lost" ||
              pipeline_stage.toLowerCase() === "closed - lost"
            ) {
              // Stop all future follow-ups
              await supabase
                .from("lead_auto_follow_up_stats")
                .update({ auto_follow_up_disabled: true })
                .eq("campaign_id", campaign_id)
                .eq("contact_id", contact_id);

              // Log event
              await supabase.from("follow_up_events").insert({
                account_id: finalAccountId,
                campaign_id,
                contact_id,
                rule_id: rule.id,
                event_type: "stopped_by_pipeline_stage",
                details: {
                  pipeline_stage,
                  previous_stage,
                },
              });

              console.log(
                `Stopped follow-ups for contact ${contact_id} due to pipeline stage: ${pipeline_stage}`
              );
            } else if (
              pipeline_stage.toLowerCase() === "quoted" ||
              pipeline_stage.toLowerCase() === "estimate sent"
            ) {
              // Schedule a check-in follow-up if configured
              // This would be handled by the no-reply scheduler with a special rule
              // For now, we just log that the stage changed
              console.log(
                `Pipeline stage changed to ${pipeline_stage} for contact ${contact_id}`
              );
            }
          }
        }
      }
    }

    // 4. Process lead score rules
    if (lead_score !== undefined && previous_score !== undefined) {
      const { data: scoreRules, error: scoreError } = await supabase
        .from("follow_up_rules")
        .select("*")
        .eq("program_id", program.id)
        .eq("type", "lead_score")
        .eq("is_enabled", true);

      if (scoreRules && scoreRules.length > 0) {
        for (const rule of scoreRules) {
          // Check if score is within range
          const scoreInRange =
            (rule.min_lead_score === null || lead_score >= rule.min_lead_score) &&
            (rule.max_lead_score === null || lead_score <= rule.max_lead_score);

          if (scoreInRange) {
            // V1: Just log the score change
            // Future versions could schedule a "nudge" email or mark as priority
            console.log(
              `Lead score ${lead_score} is in range for rule ${rule.id} (${rule.min_lead_score}-${rule.max_lead_score})`
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pipeline/score update processed",
        contact_id,
        campaign_id,
        pipeline_stage,
        lead_score,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing pipeline/score update:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
























































