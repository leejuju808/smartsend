// Block 451 — Inbox Warmup v2: AI Warmup Analyzer
// Analyzes inbox warmup profile and returns adaptive recommendations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface WarmupAnalysis {
  target_for_today: number;
  should_pause: boolean;
  should_slow_down: boolean;
  should_speed_up: boolean;
  health_score: number;
  notes: string[];
  next_stage_estimate_days: number;
}

Deno.serve(async () => {
  try {
    console.log("Starting inbox warmup analysis...");

    // Get all inboxes with warmup enabled
    const { data: inboxes, error: inboxError } = await supabase
      .from("sender_inboxes")
      .select(`
        id,
        workspace_id,
        domain_id,
        warmup_enabled,
        created_at,
        sender_domains (
          id,
          domain,
          domain_health_score,
          warmup_stage,
          created_at,
          spf_valid,
          dkim_valid,
          dmarc_valid
        )
      `)
      .eq("warmup_enabled", true)
      .eq("connected", true);

    if (inboxError) {
      console.error("Error fetching inboxes:", inboxError);
      return new Response(JSON.stringify({ error: inboxError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!inboxes || inboxes.length === 0) {
      console.log("No inboxes with warmup enabled");
      return new Response(
        JSON.stringify({ ok: true, analyzed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let analyzed = 0;

    for (const inbox of inboxes) {
      try {
        const analysis = await analyzeInboxWarmup(inbox);
        
        // Update inbox_warmup_status
        const { error: updateError } = await supabase
          .from("inbox_warmup_status")
          .upsert({
            inbox_id: inbox.id,
            daily_target: analysis.target_for_today,
            warmup_health_score: analysis.health_score,
            warmup_ai_notes: analysis.notes.join("; "),
            warmup_stage: getStageFromTarget(analysis.target_for_today),
            is_paused: analysis.should_pause,
            pause_reason: analysis.should_pause ? analysis.notes[0] : null,
            paused_at: analysis.should_pause ? new Date().toISOString() : null,
            last_analyzed_at: new Date().toISOString(),
          }, {
            onConflict: "inbox_id"
          });

        if (updateError) {
          console.error(`Error updating warmup status for inbox ${inbox.id}:`, updateError);
          continue;
        }

        // Handle pause/resume
        if (analysis.should_pause) {
          const { error: pauseError } = await supabase.rpc("auto_pause_warmup", {
            p_inbox_id: inbox.id,
            p_reason: analysis.notes[0] || "AI detected deliverability issues"
          });
          if (pauseError) {
            console.error(`Error pausing warmup for inbox ${inbox.id}:`, pauseError);
          }
        } else {
          // Check if currently paused and should resume
          const { data: currentStatus } = await supabase
            .from("inbox_warmup_status")
            .select("is_paused")
            .eq("inbox_id", inbox.id)
            .single();
          
          if (currentStatus?.is_paused && !analysis.should_slow_down) {
            const { error: resumeError } = await supabase.rpc("auto_resume_warmup", {
              p_inbox_id: inbox.id,
              p_reason: "Conditions improved"
            });
            if (resumeError) {
              console.error(`Error resuming warmup for inbox ${inbox.id}:`, resumeError);
            }
          }
        }

        analyzed++;
      } catch (error: any) {
        console.error(`Error analyzing inbox ${inbox.id}:`, error);
        continue;
      }
    }

    console.log(`Analyzed ${analyzed} inboxes`);

    return new Response(
      JSON.stringify({ ok: true, analyzed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in inbox-warmup-analyzer:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function analyzeInboxWarmup(inbox: any): Promise<WarmupAnalysis> {
  // Get inbox health metrics
  const { data: health } = await supabase
    .from("inbox_health")
    .select("*")
    .eq("inbox_id", inbox.id)
    .single();

  // Get domain health
  const domain = inbox.sender_domains;
  const domainHealth = domain?.domain_health_score ?? 50;
  const inboxHealth = health?.score ?? 50;
  const bounceRate = health?.bounce_rate ?? 0;
  const spamRate = health?.spam_rate ?? 0;

  // Get last 7 days of warmup volume
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: warmupQueue } = await supabase
    .from("warmup_queue")
    .select("sent_at")
    .eq("inbox_id", inbox.id)
    .gte("sent_at", sevenDaysAgo.toISOString())
    .not("sent_at", "is", null);

  const last7DaysVolume = warmupQueue?.length ?? 0;
  const avgDailyVolume = last7DaysVolume / 7;

  // Get current warmup status
  const { data: warmupStatus } = await supabase
    .from("inbox_warmup_status")
    .select("*")
    .eq("inbox_id", inbox.id)
    .single();

  const previousTarget = warmupStatus?.daily_target ?? 5;

  // Calculate inbox age
  const inboxAge = Math.floor(
    (new Date().getTime() - new Date(inbox.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate domain age
  const domainAge = domain?.created_at
    ? Math.floor(
        (new Date().getTime() - new Date(domain.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  // Get warmup progress (warmup_stage from inbox_health)
  const warmupProgress = health?.warmup_stage ?? 0;

  // AI Analysis Logic
  const notes: string[] = [];
  let targetForToday = previousTarget;
  let shouldPause = false;
  let shouldSlowDown = false;
  let shouldSpeedUp = false;
  let healthScore = 50;
  let nextStageEstimateDays = 30;

  // Critical conditions → auto-pause
  if (bounceRate > 0.08 || spamRate > 0.004) {
    shouldPause = true;
    notes.push(`Critical: bounce rate ${(bounceRate * 100).toFixed(2)}% or spam rate ${(spamRate * 100).toFixed(2)}%`);
    healthScore = Math.max(0, healthScore - 50);
  }
  // DNS failure → pause
  else if (domain && (!domain.spf_valid || !domain.dkim_valid || !domain.dmarc_valid)) {
    shouldPause = true;
    notes.push("DNS configuration incomplete (SPF/DKIM/DMARC)");
    healthScore = Math.max(0, healthScore - 30);
  }
  // Domain health critical → pause
  else if (domainHealth < 30) {
    shouldPause = true;
    notes.push(`Domain health critical: ${domainHealth}/100`);
    healthScore = Math.max(0, healthScore - 40);
  }
  // Unhealthy → slowdown
  else if (bounceRate > 0.04 || spamRate > 0.002 || inboxHealth < 60 || domainHealth < 60) {
    shouldSlowDown = true;
    targetForToday = Math.max(5, Math.floor(previousTarget * 0.5));
    
    if (bounceRate > 0.04) {
      notes.push(`Bounce rate high: ${(bounceRate * 100).toFixed(2)}% - reducing warmup by 50%`);
      healthScore -= 20;
    }
    if (spamRate > 0.002) {
      notes.push(`Spam rate elevated: ${(spamRate * 100).toFixed(2)}% - reducing warmup by 50%`);
      healthScore -= 25;
    }
    if (inboxHealth < 60) {
      notes.push(`Inbox health low: ${inboxHealth}/100`);
      healthScore -= 15;
    }
    if (domainHealth < 60) {
      notes.push(`Domain health low: ${domainHealth}/100`);
      healthScore -= 15;
    }
  }
  // Healthy → speed up
  else if (inboxHealth > 80 && domainHealth > 80 && bounceRate < 0.02 && spamRate < 0.001) {
    shouldSpeedUp = true;
    targetForToday = previousTarget + 5;
    notes.push("Inbox and domain healthy - increasing warmup by 5/day");
    healthScore = Math.min(100, healthScore + 10);
  }
  // Medium health → maintain
  else {
    targetForToday = previousTarget;
    notes.push("Maintaining current warmup volume");
  }

  // Domain age restrictions
  if (domainAge < 14) {
    targetForToday = Math.min(targetForToday, 10);
    notes.push(`Domain is <14 days old → keeping warmup under 10/day`);
    healthScore -= 10;
  }

  // Stage-based limits
  const currentStage = warmupStatus?.warmup_stage ?? "stage_1";
  if (currentStage === "stage_1") {
    targetForToday = Math.min(targetForToday, 15);
    nextStageEstimateDays = Math.max(1, 7 - warmupProgress);
  } else if (currentStage === "stage_2") {
    targetForToday = Math.min(targetForToday, 40);
    nextStageEstimateDays = Math.max(1, 21 - warmupProgress);
  } else if (currentStage === "stage_3") {
    targetForToday = Math.min(targetForToday, 80);
    nextStageEstimateDays = Math.max(1, 60 - warmupProgress);
  } else {
    targetForToday = Math.min(targetForToday, 150);
    nextStageEstimateDays = 0;
  }

  // Calculate health score
  healthScore = Math.max(0, Math.min(100, healthScore));
  
  // Base health score calculation
  let calculatedHealth = 50;
  calculatedHealth += (inboxHealth - 50) * 0.3;
  calculatedHealth += (domainHealth - 50) * 0.3;
  calculatedHealth -= bounceRate * 100 * 2;
  calculatedHealth -= spamRate * 100 * 5;
  
  if (domainAge < 14) calculatedHealth -= 10;
  if (domainAge < 30) calculatedHealth -= 5;
  
  healthScore = Math.max(0, Math.min(100, Math.floor(calculatedHealth)));

  return {
    target_for_today: Math.max(5, Math.floor(targetForToday)),
    should_pause,
    should_slow_down: shouldSlowDown,
    should_speed_up: shouldSpeedUp,
    health_score: healthScore,
    notes,
    next_stage_estimate_days: Math.max(0, nextStageEstimateDays),
  };
}

function getStageFromTarget(target: number): string {
  if (target <= 15) return "stage_1";
  if (target <= 40) return "stage_2";
  if (target <= 80) return "stage_3";
  return "stage_4";
}



