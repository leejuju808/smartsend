// Block 21320 — SmartSend AI Calendar Auto-Scheduler Worker
// Periodic checks for auto-scheduling events

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
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
    const now = new Date().toISOString();

    console.log(`[Auto-Scheduler Worker] Starting run at ${now}`);

    const results = {
      proposal_views_checked: 0,
      events_scheduled: 0,
      errors: [] as string[],
    };

    // ============================================================
    // 1. Check Proposal Views → Auto-Schedule Follow-Ups
    // ============================================================
    try {
      const { data: proposalViewsResult, error: proposalError } = await supabase.rpc(
        "check_proposal_views_and_schedule"
      );

      if (proposalError) {
        console.error("[Proposal Views] Error:", proposalError);
        results.errors.push(`Proposal views: ${proposalError.message}`);
      } else {
        results.proposal_views_checked = 1;
        console.log("[Proposal Views] Checked for hot proposal views");
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[Proposal Views] Exception:", errorMsg);
      results.errors.push(`Proposal views exception: ${errorMsg}`);
    }

    // ============================================================
    // 2. Check for Unanswered Homeowner Replies → Auto-Schedule Follow-Ups
    // ============================================================
    try {
      const { error: homeownerError } = await supabase.rpc(
        "check_and_create_homeowner_followup_events"
      );

      if (homeownerError) {
        console.error("[Homeowner Follow-Ups] Error:", homeownerError);
        results.errors.push(`Homeowner follow-ups: ${homeownerError.message}`);
      } else {
        console.log("[Homeowner Follow-Ups] Checked for unanswered replies");
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[Homeowner Follow-Ups] Exception:", errorMsg);
      results.errors.push(`Homeowner follow-ups exception: ${errorMsg}`);
    }

    // ============================================================
    // 3. Check for Unresponsive Adjusters → Auto-Schedule Follow-Ups
    // ============================================================
    try {
      const { error: adjusterError } = await supabase.rpc(
        "check_and_create_adjuster_followup_events"
      );

      if (adjusterError) {
        console.error("[Adjuster Follow-Ups] Error:", adjusterError);
        results.errors.push(`Adjuster follow-ups: ${adjusterError.message}`);
      } else {
        console.log("[Adjuster Follow-Ups] Checked for unresponsive adjusters");
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[Adjuster Follow-Ups] Exception:", errorMsg);
      results.errors.push(`Adjuster follow-ups exception: ${errorMsg}`);
    }

    // ============================================================
    // 4. Send 24-Hour Notifications for Upcoming Events
    // ============================================================
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Find auto-scheduled events happening tomorrow that haven't been notified
      const { data: upcomingEvents, error: eventsError } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, event_start_time, workspace_id, thread_id, job_id, assigned_to_user_id, assigned_to_role")
        .eq("event_date", tomorrowStr)
        .eq("status", "scheduled")
        .eq("auto_scheduled", true)
        .eq("notification_sent_24h", false)
        .limit(100);

      if (eventsError) {
        console.error("[24h Notifications] Error:", eventsError);
        results.errors.push(`24h notifications: ${eventsError.message}`);
      } else if (upcomingEvents && upcomingEvents.length > 0) {
        console.log(`[24h Notifications] Found ${upcomingEvents.length} events to notify`);

        for (const event of upcomingEvents) {
          // Get users to notify
          const { data: users } = await supabase
            .from("org_memberships")
            .select("user_id, org_id")
            .eq("status", "active")
            .eq("org_id", (
              await supabase
                .from("workspaces")
                .select("org_id")
                .eq("id", event.workspace_id)
                .single()
            ).data?.org_id)
            .or(
              `roofing_role.eq.${event.assigned_to_role},user_id.eq.${event.assigned_to_user_id || "null"}`
            );

          if (users) {
            for (const user of users) {
              await supabase.from("notifications").insert({
                user_id: user.user_id,
                workspace_id: event.workspace_id,
                thread_id: event.thread_id,
                job_id: event.job_id,
                type: "calendar_event_reminder_24h",
                title: `Event Tomorrow: ${event.title}`,
                body: `Auto-scheduled event happening tomorrow. ${event.event_start_time || ""}`,
                payload: {
                  event_id: event.id,
                  event_type: event.event_type,
                },
                is_read: false,
              });
            }
          }

          // Mark as notified
          await supabase
            .from("calendar_events")
            .update({ notification_sent_24h: true })
            .eq("id", event.id);
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[24h Notifications] Exception:", errorMsg);
      results.errors.push(`24h notifications exception: ${errorMsg}`);
    }

    // ============================================================
    // 5. Send 1-Hour Notifications for Upcoming Events
    // ============================================================
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
      const oneHourDateStr = oneHourFromNow.toISOString().split("T")[0];
      const oneHourTimeStr = oneHourFromNow.toTimeString().slice(0, 5);

      // Find auto-scheduled events happening in 1 hour
      const { data: imminentEvents, error: imminentError } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, event_start_time, workspace_id, thread_id, job_id, assigned_to_user_id, assigned_to_role")
        .eq("event_date", oneHourDateStr)
        .lte("event_start_time", oneHourTimeStr)
        .eq("status", "scheduled")
        .eq("auto_scheduled", true)
        .eq("notification_sent_1h", false)
        .limit(100);

      if (imminentError) {
        console.error("[1h Notifications] Error:", imminentError);
        results.errors.push(`1h notifications: ${imminentError.message}`);
      } else if (imminentEvents && imminentEvents.length > 0) {
        console.log(`[1h Notifications] Found ${imminentEvents.length} events to notify`);

        for (const event of imminentEvents) {
          // Get users to notify
          const { data: users } = await supabase
            .from("org_memberships")
            .select("user_id, org_id")
            .eq("status", "active")
            .eq("org_id", (
              await supabase
                .from("workspaces")
                .select("org_id")
                .eq("id", event.workspace_id)
                .single()
            ).data?.org_id)
            .or(
              `roofing_role.eq.${event.assigned_to_role},user_id.eq.${event.assigned_to_user_id || "null"}`
            );

          if (users) {
            for (const user of users) {
              await supabase.from("notifications").insert({
                user_id: user.user_id,
                workspace_id: event.workspace_id,
                thread_id: event.thread_id,
                job_id: event.job_id,
                type: "calendar_event_reminder_1h",
                title: `Event in 1 Hour: ${event.title}`,
                body: `Auto-scheduled event starting soon.`,
                payload: {
                  event_id: event.id,
                  event_type: event.event_type,
                },
                is_read: false,
              });
            }
          }

          // Mark as notified
          await supabase
            .from("calendar_events")
            .update({ notification_sent_1h: true })
            .eq("id", event.id);
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[1h Notifications] Exception:", errorMsg);
      results.errors.push(`1h notifications exception: ${errorMsg}`);
    }

    console.log(`[Auto-Scheduler Worker] Completed run. Results:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[Auto-Scheduler Worker] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
















































