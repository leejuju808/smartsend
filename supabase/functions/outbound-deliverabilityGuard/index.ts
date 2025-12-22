// supabase/functions/outbound-deliverabilityGuard/index.ts
// Block 15500 — Deliverability Guard v2
// Monitors domain health and applies adaptive throttling

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { workspace_id } = await req.json().catch(() => ({}));

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "settings_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate domain health (simplified - in production, use actual bounce/complaint rates)
    const domainHealth = settings.domain_health_score || 85.0;

    // Get recent activity for last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { count: sentCount } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("status", "sent")
      .gte("sent_at", twentyFourHoursAgo.toISOString());

    // Get bounce/complaint events (if available)
    const { count: bounceCount } = await supabaseAdmin
      .from("bounce_events")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .catch(() => ({ count: 0 }));

    const { count: complaintCount } = await supabaseAdmin
      .from("complaint_events")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .catch(() => ({ count: 0 }));

    const totalSent = sentCount || 0;
    const bounceRate = totalSent > 0 ? ((bounceCount || 0) / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? ((complaintCount || 0) / totalSent) * 100 : 0;

    // Calculate adaptive send rate
    let adaptiveRate: number;
    let throttleMode: "full" | "normal" | "reduced" | "slow" = "full";

    if (domainHealth < 60) {
      adaptiveRate = 50; // Slow mode
      throttleMode = "slow";
    } else if (domainHealth < 70) {
      adaptiveRate = 100; // Reduced mode
      throttleMode = "reduced";
    } else if (domainHealth < 85) {
      adaptiveRate = 150; // Normal mode
      throttleMode = "normal";
    } else {
      adaptiveRate = settings.max_send_rate || 200; // Full mode
      throttleMode = "full";
    }

    // Check warmup status
    const warmupActive = settings.warmup_active || false;
    const warmupStage = settings.warmup_stage || 0;
    let warmupLimit: number | null = null;

    if (warmupActive && warmupStage > 0 && warmupStage <= 8) {
      warmupLimit = [20, 30, 40, 50, 75, 100, 150, null][warmupStage - 1] || null;
    }

    // Get sends today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: sentToday } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("status", "sent")
      .gte("sent_at", today.toISOString());

    const sendsToday = sentToday || 0;

    // Determine if sending should be paused
    let shouldPause = false;
    let pauseReason: string | null = null;

    if (warmupLimit !== null && sendsToday >= warmupLimit) {
      shouldPause = true;
      pauseReason = `Warmup limit reached (${warmupLimit} emails/day, stage ${warmupStage})`;
    } else if (bounceRate > 8) {
      shouldPause = true;
      pauseReason = `Bounce rate too high (${bounceRate.toFixed(2)}%)`;
    } else if (complaintRate > 0.3) {
      shouldPause = true;
      pauseReason = `Complaint rate too high (${complaintRate.toFixed(2)}%)`;
    } else if (domainHealth < 30) {
      shouldPause = true;
      pauseReason = `Domain health critical (${domainHealth})`;
    }

    // Log deliverability events if needed
    if (shouldPause) {
      await supabaseAdmin.from("deliverability_events").insert({
        workspace_id,
        event_type: "throttle_pause",
        event_data: {
          reason: pauseReason,
          domain_health: domainHealth,
          bounce_rate: bounceRate,
          complaint_rate: complaintRate,
        },
      });
    } else if (throttleMode !== "full") {
      await supabaseAdmin.from("deliverability_events").insert({
        workspace_id,
        event_type: "throttle_slow",
        event_data: {
          mode: throttleMode,
          rate: adaptiveRate,
          domain_health: domainHealth,
        },
      });
    }

    return new Response(
      JSON.stringify({
        workspace_id,
        domain_health: domainHealth,
        adaptive_rate: adaptiveRate,
        throttle_mode: throttleMode,
        warmup_active: warmupActive,
        warmup_stage: warmupStage,
        warmup_limit: warmupLimit,
        sends_today: sendsToday,
        should_pause: shouldPause,
        pause_reason: pauseReason,
        bounce_rate: bounceRate,
        complaint_rate: complaintRate,
        stats_24h: {
          sent: totalSent,
          bounced: bounceCount || 0,
          complaints: complaintCount || 0,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Deliverability guard error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































