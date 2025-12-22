// Block 44000 — SmartSend Roofing Homeowner Portal + Live Job Tracker v1
// Edge Function: /homeowner/job-feed
// 
// Returns complete job feed for homeowner portal:
// - Job status and stages
// - Photos (before, during, after, issues)
// - Live timeline feed (from job_activity_log)
// - Messages
// - Change orders
// Input: { token: string }
// Output: Complete job feed data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

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
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "token is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate token and get portal/job info (Block 94000)
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id, workspace_id, is_active")
      .eq("portal_token", token)
      .single();

    if (portalError || !portal || !portal.is_active) {
      return new Response(
        JSON.stringify({ error: "Invalid or inactive portal token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const jobId = portal.job_id;
    const portalId = portal.id;

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch photos grouped by category
    const { data: photos, error: photosError } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Group photos by category
    const photosByCategory = {
      before: photos?.filter((p) => p.category === "before") || [],
      during: photos?.filter((p) => p.category === "during") || [],
      after: photos?.filter((p) => p.category === "after") || [],
      issues: photos?.filter((p) => p.category === "issue") || [],
    };

    // Fetch timeline events from job_activity_log
    const { data: activityLogs, error: activityError } = await supabase
      .from("job_activity_log")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(100);

    // Format timeline entries
    const timeline = (activityLogs || []).map((log) => {
      let title = "";
      let description = "";

      switch (log.type) {
        case "start":
          title = "Crew arrived onsite";
          description = log.payload?.notes || "";
          break;
        case "photo":
          title = "Photo uploaded";
          description = log.payload?.caption || "";
          break;
        case "change_order":
          title = "Issue detected → Change order created";
          description = log.payload?.description || "";
          break;
        case "material":
          title = "Material update";
          description = `${log.payload?.material_name || ""} - ${log.payload?.quantity || ""} ${log.payload?.unit || ""}`;
          break;
        case "punch":
          title = "Punch list item";
          description = log.payload?.description || "";
          break;
        case "stop":
          title = "Work completed for the day";
          description = log.payload?.notes || "";
          break;
        default:
          title = "Job update";
          description = JSON.stringify(log.payload || {});
      }

      return {
        id: log.id,
        timestamp: log.created_at,
        title,
        description,
        type: log.type,
      };
    });

    // Fetch messages (Block 94000 - homeowner_messages)
    const { data: messages, error: messagesError } = await supabase
      .from("homeowner_messages")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch experience milestones (Block 94000)
    const { data: milestones, error: milestonesError } = await supabase
      .from("experience_milestones")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    // Get current milestone (what's next)
    const { data: currentMilestoneData } = await supabase
      .rpc("get_current_milestone", { p_job_id: jobId });

    const currentMilestone = currentMilestoneData && currentMilestoneData.length > 0
      ? currentMilestoneData[0]
      : null;

    // Fetch homeowner preferences (Block 94000)
    const { data: preferences, error: preferencesError } = await supabase
      .from("homeowner_preferences")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    // Fetch pending feedback triggers (Block 94000)
    // Check if feedback should be shown based on job status and existing feedback
    const { data: existingFeedback, error: feedbackError } = await supabase
      .from("experience_feedback_events")
      .select("trigger_type")
      .eq("job_id", jobId);

    const existingTriggerTypes = new Set((existingFeedback || []).map((f) => f.trigger_type));
    
    // Determine which feedback trigger to show
    let activeFeedbackTrigger: string | null = null;
    if (job.status === "completed" && !existingTriggerTypes.has("after_cleanup")) {
      activeFeedbackTrigger = "after_cleanup";
    } else if (job.status === "in_progress" && !existingTriggerTypes.has("after_install")) {
      activeFeedbackTrigger = "after_install";
    } else if (job.status === "scheduled" && !existingTriggerTypes.has("after_estimate")) {
      activeFeedbackTrigger = "after_estimate";
    }

    // Fetch pending change orders
    const { data: changeOrders, error: coError } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_photos:change_order_photos(*),
        homeowner_action:homeowner_change_order_action(*)
      `)
      .eq("job_id", jobId)
      .in("status", ["pending", "approved", "rejected"])
      .order("created_at", { ascending: false });

    // Format change orders for homeowner
    const formattedChangeOrders = (changeOrders || []).map((co) => ({
      id: co.id,
      description: co.description,
      amount: co.suggested_price || co.amount || 0,
      status: co.status,
      photos: co.change_order_photos || [],
      homeowner_action: co.homeowner_action?.[0] || null,
      created_at: co.created_at,
    }));

    // Calculate progress percentage based on status
    const statusProgress: Record<string, number> = {
      scheduled: 10,
      crew_en_route: 20,
      in_progress: 40,
      mid_install: 60,
      cleanup: 80,
      completed: 95,
      inspection: 98,
      final_walkthrough: 100,
    };

    const progressPercent = statusProgress[job.homeowner_status || "scheduled"] || 0;

    // Fetch closeout packet (Block 45000)
    const { data: closeoutPacket, error: closeoutError } = await supabase
      .from("closeout_packets")
      .select(`
        id,
        status,
        pdf_url,
        ai_summary_text,
        generated_at,
        sent_to_homeowner_at
      `)
      .eq("job_id", jobId)
      .eq("status", "generated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Track homeowner view/download (if packet exists and not yet viewed)
    if (closeoutPacket && !closeoutPacket.sent_to_homeowner_at) {
      // Mark as viewed (first time homeowner accesses portal with closeout packet)
      await supabase
        .from("closeout_packets")
        .update({ homeowner_viewed_at: new Date().toISOString() })
        .eq("id", closeoutPacket.id);
    }

    return new Response(
      JSON.stringify({
        job: {
          id: job.id,
          name: job.title || `Job #${job.id.substring(0, 8)}`,
          address: job.address || null,
          status: job.homeowner_status || "scheduled",
          progress_percent: progressPercent,
          crew_name: job.crew_name || null,
          scheduled_date: job.scheduled_date || null,
        },
        photos: photosByCategory,
        timeline,
        messages: (messages || []).reverse(), // Reverse to show oldest first
        change_orders: formattedChangeOrders,
        closeout_packet: closeoutPacket ? {
          id: closeoutPacket.id,
          pdf_url: closeoutPacket.pdf_url,
          summary_text: closeoutPacket.ai_summary_text,
          generated_at: closeoutPacket.generated_at,
        } : null,
        // Block 94000 - Experience Engine data
        milestones: milestones || [],
        current_milestone: currentMilestone,
        preferences: preferences || null,
        active_feedback_trigger: activeFeedbackTrigger,
        portal_id: portalId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in job-feed:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

