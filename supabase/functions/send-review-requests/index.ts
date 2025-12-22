// Block 252300 — SmartSend Customer Communication Engine v1
// Edge Function: Send Review Requests
// Scheduled to run daily, sends review requests 24 hours after job completion

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find jobs completed 24 hours ago that haven't received review requests
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get completed milestones from 24 hours ago
    const { data: completedMilestones, error: milestonesError } = await supabase
      .from("production_milestones")
      .select(`
        id,
        job_id,
        completed_date,
        jobs!inner (
          id,
          company_id,
          status,
          homeowner_name,
          homeowner_phone,
          homeowner_email
        )
      `)
      .eq("status", "completed")
      .like("name", "%complete%")
      .gte("completed_date", twentyFourHoursAgo.toISOString())
      .lte("completed_date", new Date().toISOString());

    if (milestonesError) {
      throw milestonesError;
    }

    if (!completedMilestones || completedMilestones.length === 0) {
      return new Response(
        JSON.stringify({ message: "No jobs ready for review requests" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const milestone of completedMilestones) {
      const job = milestone.jobs as any;

      // Check if review request already sent
      const { data: existingReview } = await supabase
        .from("communication_events")
        .select("id")
        .eq("job_id", job.id)
        .eq("event_type", "review_request")
        .limit(1)
        .single();

      if (existingReview) {
        continue; // Already sent
      }

      // Get company's Google review link (in production, this would be from company settings)
      const { data: company } = await supabase
        .from("companies")
        .select("id, name, google_review_link")
        .eq("id", job.company_id)
        .single();

      const reviewLink = company?.google_review_link || 
        "https://g.page/r/YOUR_GOOGLE_PLACE_ID/review";

      // Call the send_review_request function
      const { data: eventId, error: sendError } = await supabase.rpc(
        "send_review_request",
        {
          p_job_id: job.id,
        }
      );

      if (sendError) {
        console.error(`Error sending review request for job ${job.id}:`, sendError);
        results.push({
          job_id: job.id,
          status: "error",
          error: sendError.message,
        });
      } else {
        results.push({
          job_id: job.id,
          status: "sent",
          event_id: eventId,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Review requests processed",
        count: results.length,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-review-requests:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
























